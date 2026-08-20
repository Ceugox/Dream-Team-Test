# Runbook — LinkedIn Remote Sync

Operação do fluxo de conexão LinkedIn sem instalação (sessão Browserless + fila assíncrona).
Nenhum valor de chave real neste documento.

## Feature flag

| Variável | Efeito |
|---|---|
| `LINKEDIN_REMOTE_SYNC_ENABLED=true` | Habilita criação de sessões (exige `BROWSERLESS_API_TOKEN` não vazio) |
| `LINKEDIN_REMOTE_SYNC_ENABLED=false` (ou ausente) | `POST /api/linkedin/sessions` responde `503 sync_disabled`; o restante do produto (Google, vagas, convites, inferências) segue intacto |

Desligar a flag é o **rollback padrão**: nenhuma migração precisa ser revertida e o
watchdog continua expirando sessões órfãs mesmo com a flag desligada.

## Variáveis de ambiente

`BROWSERLESS_ENDPOINT`, `BROWSERLESS_API_TOKEN`, `LINKEDIN_MAX_CONCURRENT_SESSIONS` (máx 2),
`LINKEDIN_LOGIN_TIMEOUT_MS` (600000), `LINKEDIN_SESSION_TIMEOUT_MS` (2700000),
`LINKEDIN_PROFILE_DELAY_MIN_MS`/`MAX_MS` (2500/5500), `BROWSERLESS_RECONNECT_TIMEOUT_MS`,
`APP_SECRET` (deriva a chave AES da referência do provider), `CRON_SECRET` (watchdog).
Web e worker precisam do mesmo conjunto. Nunca imprimir valores em terminal, log ou Git.

## Health check

- Web: `GET /` (healthcheck do compose/Railway).
- Fila: `GET /api/admin/orchestration` (workflows `linkedin_sync` com contagens de tasks).
- Sessão específica: `GET /api/linkedin/sessions/<id>` autenticado como o dono.

## Limite concorrente

Capacidade global de 2 sessões ativas, reservada atomicamente no INSERT
(`createSessionWithCapacity`). `409 capacity_exhausted` na criação significa que outra
sessão está viva — verifique sessões presas antes de aumentar qualquer limite.

## Sessões órfãs / watchdog

```
POST /api/internal/linkedin/watchdog
Authorization: Bearer $CRON_SECRET
```

Expira sessões com `expires_at` vencido, destrói o browser remoto, cancela as tasks
pendentes do workflow e responde apenas `{ "expired": n }`. Agendar a cada 5 minutos
(cron do Railway ou serviço worker). `503 not_configured` = `CRON_SECRET` ausente.

Sessões presas em `authenticated`/`inventorying` por worker morto são liberadas
automaticamente no retry da task (`failure_code = stale_run`).

## Cancelamento

`POST /api/linkedin/sessions/<id>/cancel` (dono autenticado). Idempotente: marca
`cancelled`, apaga a referência do provider, destrói o browser remoto e cancela as
tasks pendentes. O botão **Encerrar agora** da UI chama esta rota.

## Sinais de rate limit / checkpoint

- `paused_rate_limit` (`failure_code = rate_limit`): o LinkedIn devolveu 429/aviso de
  limite. Não reexecutar imediatamente; aguardar e abrir nova sessão mais tarde.
- `needs_attention` (`failure_code = checkpoint` ou `captcha`): o LinkedIn pediu
  verificação. **Nunca contornar**: o usuário resolve no próprio LinkedIn e abre nova sessão.
- Ambos mantêm o browser remoto vivo até o watchdog expirar a sessão.
- Sequência de pausas em contas diferentes = reduzir uso no dia; não alterar delays
  para baixo dos defaults.

## Observabilidade

Worker e handlers logam JSON de linha única via `safeLogger`, que redige token, cookie,
authorization, password, referências `enc:v1`, URLs websocket e `token=` em query.
Campos permitidos: sessionId, ownerType, status, contagens, duração, failureCode,
taskType, workflowId. Se um log precisar de campo novo, adicionar ao teste de redaction
primeiro.

## Rollback completo

1. `LINKEDIN_REMOTE_SYNC_ENABLED=false` no Railway (web + worker).
2. Rodar o watchdog uma vez para expirar sessões vivas.
3. Conferir `GET /api/admin/orchestration`: workflows `linkedin_sync` devem terminar
   em `completed`/`cancelled`/`failed`, nunca presos em `running`.
4. A UI mostra "conexão temporariamente indisponível" e o restante do produto segue.
