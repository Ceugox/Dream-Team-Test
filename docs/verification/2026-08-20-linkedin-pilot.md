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

## Fase 2 — piloto real (concluído)

**Resultado**: coleta completa das ~372 conexões reais do admin, via **conector local por extensão**.

**Decisões e achados durante o piloto:**
- **Provider remoto abandonado para o piloto**: Browserless free não suporta LiveURL
  ("Live URLs are not supported"). Avaliado Anchor Browser (free tier com live view) e
  implementado como provider selecionável (`LINKEDIN_BROWSER_PROVIDER`), mas o fluxo remoto
  tem fricção alta (login manual numa tela isolada, recuperação de sessão em deploy). Mantido
  no código atrás da flag, **desligado** (`LINKEDIN_REMOTE_SYNC_ENABLED=false`).
- **Caminho adotado**: conector local por extensão (browser-extension/), que lê a página de
  conexões no próprio navegador do usuário. Bugs corrigidos até funcionar:
  1. `storage.session` inacessível a content scripts → `setAccessLevel` no background.
  2. Extensão em Downloads era v1.0.0 (sem `profileUrl`); usar a do repo.
  3. `.dockerignore` excluía o zip do conector do build → removido.
  4. **Virtualização real** da lista (~10 cards no DOM por vez): coletar a cada passo pequeno
     (350px/500ms) com `a.href` normalizado para `/in/<slug>`, oscilando no fundo para paginar.
     Validado no console (372/374) antes de portar. Extensão v1.2.2.
- **Sync incremental**: rotas admin/member browser-sync trocadas de DELETE+insert para UPSERT
  por linkedin_url — coletas parciais nunca reduzem a rede já mapeada.
- **Hotfixes de produção no caminho**: `z.guid()` no lugar de `z.uuid()` (org id padrão tem
  version nibble 0); navegar a sessão remota para /login (nascia em about:blank); lease curto
  de 90s com heartbeat para recuperação de worker em ≤2 min.

**Pendência menor (não bloqueia)**: a extensão captura nome + URL mas nem sempre a headline,
gerando "contexto incompleto" em alguns contatos. Melhorar a extração de headline exige o
markup atual do card de conexão (não capturado nesta sessão).

## Pendências originais da fase 2 (superadas pelo caminho da extensão)

1. Usuário define `BROWSERLESS_API_TOKEN` no serviço web (o worker herda por referência).
2. Ligar `LINKEDIN_REMOTE_SYNC_ENABLED=true`.
3. Fluxo real admin: consentimento → LiveURL → login normal → inventário → ≥1 perfil
   enriquecido → recomendação incremental → `Encerrar agora`; nova sessão não herda login.
4. Isolamento com membro de teste (admin não lista sessão/snapshots/contatos do membro).
5. Smoke mobile + desktop conforme Task 10 do plano.
6. Agendar o watchdog (cron Railway a cada 5 min) — hoje a chamada é manual.
