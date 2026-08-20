# Verificação — LinkedIn Remote Sync (piloto, fase 1)

Data: 2026-08-20 · Commit verificado: `d43925b` (main) · Sem valores de chave neste documento.

## Gates locais

| Gate | Resultado |
|---|---|
| Suíte completa (`npm test`) | 224/224 PASS (40 arquivos) |
| `npx tsc --noEmit` | limpo |
| `npm run lint` | 0 erros (3 warnings pré-existentes em teste) |
| `npm run build` | exit 0, `/linkedin/session/[id]` dinâmica |
| `docker compose up --build` | postgres, web e worker **healthy**; schema migrado; zero segredos nos logs |
| Migração idempotente | executada 2× no Postgres local; CHECKs de task_type/kind/timeout confirmados via `pg_constraint` |
| Grep de regressão (extensão/console/upload) | zero ocorrências em `src/` e `public/`; `browser-extension/` inexistente |

## Deploy Railway (projeto referral-copilot-mvp, produção)

- Push `e96fcde..d43925b` aceito em `origin/main` após confirmação do usuário.
- Serviços: `referral-copilot-mvp` (web, deployment `e02eb20d` SUCCESS) e `intelligence-worker`
  (repo-connected, redeploy automático pós-push; log estruturado novo `event="worker_started"`,
  `Database schema is ready` — migração aplicada em produção).
- Variáveis setadas sem exposição de valores: `CRON_SECRET` (gerado via openssl, 64 hex),
  `LINKEDIN_REMOTE_SYNC_ENABLED=false`, `BROWSERLESS_ENDPOINT`, limites e timeouts; worker
  referencia as variáveis do web (`${{referral-copilot-mvp.*}}`), incluindo o futuro
  `BROWSERLESS_API_TOKEN`.
- Serviço duplicado `referral-copilot-worker` (criado por engano nesta sessão) foi removido.

## Smoke test de produção (flag desligada)

| Verificação | Resultado |
|---|---|
| `GET /` | 200, sem `localhost` no HTML |
| `POST /api/linkedin/sessions` sem cookie | 401 `unauthorized` com `Cache-Control: no-store` e `Referrer-Policy: no-referrer` |
| Watchdog sem bearer / bearer errado | 401 |
| Watchdog com `CRON_SECRET` correto | 200 `{"expired":0}` |
| Logs web/worker | sem token, cookie, senha ou URL de sessão |

## Pendências para a fase 2 (piloto com login real)

1. Usuário define `BROWSERLESS_API_TOKEN` no serviço web (o worker herda por referência).
2. Ligar `LINKEDIN_REMOTE_SYNC_ENABLED=true`.
3. Fluxo real admin: consentimento → LiveURL → login normal → inventário → ≥1 perfil
   enriquecido → recomendação incremental → `Encerrar agora`; nova sessão não herda login.
4. Isolamento com membro de teste (admin não lista sessão/snapshots/contatos do membro).
5. Smoke mobile + desktop conforme Task 10 do plano.
6. Agendar o watchdog (cron Railway a cada 5 min) — hoje a chamada é manual.
