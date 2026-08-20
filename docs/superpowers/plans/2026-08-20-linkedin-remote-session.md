# LinkedIn Remote Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar hoje um fluxo real, mobile-first e sem instalação em que administradores e membros abrem uma sessão temporária do LinkedIn, fazem o login normal e recebem inventário, enriquecimento progressivo e recomendações preservando privacidade e evidência.

**Architecture:** Uma API autenticada cria uma sessão Browserless por meio de um adaptador, guarda apenas uma referência criptografada e entrega ao cliente uma LiveURL temporária. Um worker conecta à mesma sessão por CDP, detecta autenticação, coleta primeiro o inventário e depois perfis priorizados por vagas abertas; cada resultado é persistido incrementalmente e alimenta a inferência existente. A UI compartilhada acompanha uma máquina de estados via SSE e nunca mostra extensão, console, upload ou segredos.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, PostgreSQL/`pg`, Vitest, Zod 4, `playwright-core`, Browserless LiveURL/CDP, Docker Compose e Railway.

## Global Constraints

- Antes de alterar rotas ou componentes, ler os guias relevantes em `node_modules/next/dist/docs/` exigidos pelo `AGENTS.md`, especialmente Route Handlers, Server/Client Components e streaming.
- Nunca persistir senha, cookies, HTML de login, screenshots, teclas ou o token Browserless; nunca incluí-los em logs, respostas HTTP ou eventos SSE.
- Não contornar CAPTCHA, checkpoint, `429` ou desafio adicional: mudar a sessão para `needs_attention` ou `paused_rate_limit` e parar a automação.
- Manter a rede do membro isolada: um administrador não pode consultar sessões, contatos ou snapshots pertencentes a membros.
- Limitar o piloto a duas sessões concorrentes e um perfil por vez por sessão; todos os tempos vêm de variáveis de ambiente.
- O conector deve desligar de forma segura quando `LINKEDIN_REMOTE_SYNC_ENABLED` não for `true` ou quando o provider não estiver configurado.
- Todo teste do provider usa um fake; uma chave Browserless real somente entra na validação manual e no ambiente Railway.
- Usar commits pequenos ao fim de cada tarefa aprovada e não enviar código incompleto para produção.

---

## Task 1: Fixar contratos, configuração e máquina de estados

**Files:**
- Create: `src/lib/linkedin/config.ts`
- Create: `src/lib/linkedin/types.ts`
- Create: `src/lib/linkedin/sessionState.ts`
- Create: `src/lib/linkedin/sessionState.test.ts`
- Modify: `.env.example`
- Modify: `.env.docker.example`

- [ ] **Step 1: Escrever os testes que definem transições válidas e sanitização pública**

```ts
import { describe, expect, it } from "vitest";
import { canTransition, toPublicSession } from "./sessionState";

describe("LinkedIn session state", () => {
  it("permite o caminho feliz e bloqueia regressões", () => {
    expect(canTransition("preparing", "awaiting_login")).toBe(true);
    expect(canTransition("enriching", "results_available")).toBe(true);
    expect(canTransition("completed", "enriching")).toBe(false);
  });

  it("não serializa referência do provider", () => {
    expect(JSON.stringify(toPublicSession({
      id: "session-1", status: "awaiting_login", inventoryCount: 0,
      enrichedCount: 0, failedCount: 0, providerSessionReference: "secret",
      createdAt: new Date(0), expiresAt: new Date(1), failureCode: null,
      failureMessageSafe: null,
    }))).not.toContain("secret");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por módulos ausentes**

Run: `npm test -- src/lib/linkedin/sessionState.test.ts`

Expected: FAIL com `Cannot find module './sessionState'`.

- [ ] **Step 3: Implementar os tipos e a máquina de estados explícita**

Definir:

```ts
export type LinkedInSessionStatus =
  | "preparing" | "awaiting_login" | "authenticated" | "inventorying"
  | "enriching" | "results_available" | "completed" | "needs_attention"
  | "paused_rate_limit" | "cancelled" | "failed" | "expired";

export type LinkedInOwner =
  | { type: "admin"; id: string; organizationId: string }
  | { type: "member"; id: string; organizationId: string };
```

`toPublicSession` deve construir um DTO por allowlist; não usar spread sobre a entidade persistida.

- [ ] **Step 4: Criar parser central de configuração com Zod**

`readLinkedInConfig()` retorna `enabled`, endpoint, token, limites e timeouts. O token é acessível somente pelo provider e nunca integra o tipo de configuração pública. Defaults: concorrência `2`, login `600000`, sessão `2700000`, atraso `2500–5500 ms`.

- [ ] **Step 5: Documentar as variáveis sem valores secretos**

Adicionar a `.env.example` e `.env.docker.example`:

```dotenv
LINKEDIN_REMOTE_SYNC_ENABLED=false
BROWSERLESS_ENDPOINT=https://production-sfo.browserless.io
BROWSERLESS_API_TOKEN=
LINKEDIN_MAX_CONCURRENT_SESSIONS=2
LINKEDIN_LOGIN_TIMEOUT_MS=600000
LINKEDIN_SESSION_TIMEOUT_MS=2700000
LINKEDIN_PROFILE_DELAY_MIN_MS=2500
LINKEDIN_PROFILE_DELAY_MAX_MS=5500
```

- [ ] **Step 6: Rodar testes e commit**

Run: `npm test -- src/lib/linkedin/sessionState.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: define LinkedIn remote session lifecycle"`

---

## Task 2: Persistir sessões e snapshots profissionais com isolamento

**Files:**
- Modify: `scripts/migrate.mjs`
- Create: `src/lib/linkedin/sessionRepository.ts`
- Create: `src/lib/linkedin/sessionRepository.test.ts`
- Modify: `src/lib/platform/auth.ts`
- Modify: `src/lib/platform/auth.test.ts`

- [ ] **Step 1: Criar um ator autenticado compartilhado e testá-lo**

Adicionar em `auth.ts`:

```ts
export type AuthenticatedActor =
  | { role: "admin"; ownerId: string; organizationId: string }
  | { role: "member"; ownerId: string; organizationId: string };

export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null>;
```

Admin tem precedência somente quando o cookie admin é válido; nenhum ID do body substitui o ator.

- [ ] **Step 2: Adicionar migração idempotente**

Criar `linkedin_sync_sessions` com dono, estado, contagens, referência criptografada, consentimento, timestamps, erro seguro e `version integer`. Criar `linkedin_profile_snapshots` com `session_id`, `owner_type`, `owner_id`, `organization_id`, `linkedin_url`, `schema_version`, `professional_data jsonb`, `source_url`, `observed_at`, `extraction_confidence` e unicidade por dono/URL. Adicionar índices por dono/status e expiração.

O `CHECK` de status deve listar exatamente os estados da Task 1. `provider_session_reference` deve aceitar `NULL` para ser apagada no término.

- [ ] **Step 3: Escrever testes de repositório com um gateway de query fake**

Cobrir:

- owner admin encontra a própria sessão;
- outro admin da mesma organização recebe `null`;
- admin não encontra sessão de membro;
- atualização usa `WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4`;
- finalização limpa `provider_session_reference`;
- incremento de contadores é atômico;
- snapshot é `UPSERT` incremental e versionado.

- [ ] **Step 4: Implementar o repositório por queries parametrizadas**

Exportar `createSession`, `findOwnedSession`, `transitionOwnedSession`, `listActiveSessions`, `saveInventoryContact`, `saveProfileSnapshot`, `markFinished` e `findExpiredSessions`. Toda leitura recebe `LinkedInOwner`.

- [ ] **Step 5: Rodar migração em PostgreSQL Docker e testes**

Run: `docker compose up -d postgres`

Run: `npm run db:migrate`

Run: `npm test -- src/lib/platform/auth.test.ts src/lib/linkedin/sessionRepository.test.ts`

Expected: migração idempotente e testes PASS.

- [ ] **Step 6: Commit**

Commit: `git add scripts/migrate.mjs src/lib/linkedin src/lib/platform/auth.ts src/lib/platform/auth.test.ts && git commit -m "feat: persist isolated LinkedIn sync sessions"`

---

## Task 3: Isolar segredos e integrar Browserless LiveURL/CDP

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/linkedin/crypto.ts`
- Create: `src/lib/linkedin/crypto.test.ts`
- Create: `src/lib/linkedin/providers/types.ts`
- Create: `src/lib/linkedin/providers/browserless.ts`
- Create: `src/lib/linkedin/providers/browserless.test.ts`

- [ ] **Step 1: Instalar apenas o cliente de automação**

Run: `npm install playwright-core`

Expected: nenhum Chromium local baixado.

- [ ] **Step 2: Testar envelope criptografado e ausência de segredo em erros**

`encryptProviderReference`/`decryptProviderReference` usam AES-256-GCM com chave derivada de `APP_SECRET`, IV aleatório e versão no envelope. Testar round-trip, IVs diferentes, rejeição de adulteração e garantir que erro público não inclua token ou websocket URL.

- [ ] **Step 3: Definir o adaptador substituível**

```ts
export interface LinkedInBrowserProvider {
  createSession(input: { sessionId: string; timeoutMs: number }): Promise<{
    encryptedReferencePayload: string;
    interactiveUrl: string;
  }>;
  connect(encryptedReferencePayload: string): Promise<RemoteBrowserHandle>;
  destroy(encryptedReferencePayload: string): Promise<void>;
}
```

`RemoteBrowserHandle` expõe apenas `page`, `closeInteractiveUrl()` e `disconnect()`; o restante do sistema não recebe token ou CDP endpoint.

- [ ] **Step 4: Escrever teste do provider com Playwright/CDP fakes**

Verificar endpoint com token somente no lado servidor, chamada `Browserless.liveURL` com timeout de 10 minutos, validação `https:` da LiveURL, desconexão idempotente e redaction em falha.

- [ ] **Step 5: Implementar o provider Browserless**

Usar `chromium.connectOverCDP`, obter a página padrão e uma sessão CDP. Criar LiveURL com:

```ts
await cdp.send("Browserless.liveURL", {
  timeout: config.loginTimeoutMs,
  resizable: true,
  interactable: true,
});
```

Validar host/origem retornada, criptografar a referência necessária para reconexão e nunca lançar o erro bruto do provider através da API.

- [ ] **Step 6: Rodar testes e commit**

Run: `npm test -- src/lib/linkedin/crypto.test.ts src/lib/linkedin/providers/browserless.test.ts`

Expected: PASS.

Commit: `git add package.json package-lock.json src/lib/linkedin && git commit -m "feat: add secure Browserless session provider"`

---

## Task 4: Extrair inventário e perfis com parsers versionados

**Files:**
- Create: `src/lib/linkedin/collectors/fixtures/connections.html`
- Create: `src/lib/linkedin/collectors/fixtures/profile-complete.html`
- Create: `src/lib/linkedin/collectors/fixtures/profile-sparse.html`
- Create: `src/lib/linkedin/collectors/schemas.ts`
- Create: `src/lib/linkedin/collectors/domParsers.ts`
- Create: `src/lib/linkedin/collectors/domParsers.test.ts`
- Create: `src/lib/linkedin/collectors/pageCollector.ts`
- Create: `src/lib/linkedin/collectors/pageCollector.test.ts`

- [ ] **Step 1: Criar fixtures sanitizadas que representem os campos aprovados**

As fixtures cobrem nome, headline, URL, foto, localização, grau, cargo atual, histórico com períodos, educação, skills, certificações, idiomas, resumo, projetos, experiência internacional e conexões em comum. Nenhuma fixture contém dado real ou credencial.

- [ ] **Step 2: Escrever testes dos parsers puros**

Cobrir perfil completo, perfil incompleto com `null`, deduplicação por URL canônica, datas parciais e confiança menor quando os seletores de fallback forem usados. O parser não produz tiers ou senioridade.

- [ ] **Step 3: Implementar schemas Zod e seletores versionados**

Cada fato usa:

```ts
type ObservedField<T> = {
  value: T | null;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
};
```

Manter `LINKEDIN_SELECTOR_VERSION = "2026-08-20.1"` e funções puras separadas da navegação.

- [ ] **Step 4: Testar o controlador de páginas**

Com `RemotePage` fake, testar scroll limitado, inventário incremental, uma navegação por vez, atraso injetável, cancelamento por `AbortSignal` e detecção de URL/texto de checkpoint, CAPTCHA e `429`.

- [ ] **Step 5: Implementar coleta conservadora**

`collectConnectionInventory` e `collectProfessionalProfile` devem usar `page.evaluate` para devolver somente JSON estruturado. Não devolver HTML, cookies ou campos de formulário.

- [ ] **Step 6: Rodar testes e commit**

Run: `npm test -- src/lib/linkedin/collectors`

Expected: PASS.

Commit: `git add src/lib/linkedin/collectors && git commit -m "feat: collect LinkedIn professional profile evidence"`

---

## Task 5: Orquestrar login, inventário, priorização e limpeza

**Files:**
- Create: `src/lib/linkedin/prioritization.ts`
- Create: `src/lib/linkedin/prioritization.test.ts`
- Create: `src/lib/linkedin/syncService.ts`
- Create: `src/lib/linkedin/syncService.test.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/adminNetwork.ts`

- [ ] **Step 1: Escrever testes de priorização por vagas abertas**

Score determinístico combina termos de cargo, empresa, skills da headline, localização e capital de rede. Empates usam URL canônica. Testar que correspondência forte com vaga aberta precede contato genérico e que ausência de vagas mantém ordem estável.

- [ ] **Step 2: Escrever testes do serviço com provider, relógio e repositório fakes**

Cobrir:

- limite global de duas sessões;
- login detectado por URL autenticada e presença de navegação, nunca por senha;
- inventário salvo antes do primeiro perfil;
- resultados iniciais após o primeiro snapshot relevante;
- cancelamento e timeout sempre executam `destroy` em `finally`;
- checkpoint pausa sem retry agressivo;
- queda após três perfis preserva três resultados;
- provider reference é removida em todos os estados terminais.

- [ ] **Step 3: Implementar `LinkedInSyncService` com dependências injetadas**

Separar `createInteractiveSession`, `runCollection`, `cancelOwnedSession` e `expireOrphanedSessions`. O método de criação conta sessões ativas em transação antes de reservar capacidade.

- [ ] **Step 4: Integrar persistência de admin e membro**

Para admin, fazer UPSERT em `admin_network_contacts` filtrado por `administrator_id`. Para membro, fazer UPSERT em `network_contacts` filtrado por `member_id`. Mapear snapshot profissional para `profile_context` e campos existentes sem apagar dados mais ricos por um scrape mais fraco.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test -- src/lib/linkedin/prioritization.test.ts src/lib/linkedin/syncService.test.ts src/lib/platform/adminNetwork.test.ts`

Expected: PASS.

Commit: `git add src/lib/linkedin src/lib/platform && git commit -m "feat: orchestrate progressive LinkedIn network sync"`

---

## Task 6: Conectar a fila assíncrona e a camada de inferência

**Files:**
- Modify: `src/lib/orchestration/orchestrator.ts`
- Modify: `src/lib/orchestration/handlers.ts`
- Modify: `src/lib/orchestration/handlers.test.ts`
- Modify: `src/lib/orchestration/pipeline.test.ts`
- Modify: `scripts/intelligence-worker.ts`
- Modify: `scripts/migrate.mjs`
- Modify: `src/lib/platform/networkCapital.ts`
- Modify: `src/lib/platform/networkCapital.test.ts`

- [ ] **Step 1: Adicionar tipos de tarefa e restrições da migration**

Adicionar `linkedin_inventory`, `linkedin_profile_collect`, `linkedin_finalize` a `OrchestrationTaskType` e ao `CHECK` do banco. Adicionar workflow `linkedin_sync`, entidade `linkedin_session` e payloads validados por Zod.

- [ ] **Step 2: Testar dependências e idempotência da fila**

Inventário precede tarefas de perfil; finalização depende de todas as tarefas ainda válidas. A chave idempotente deve ser estável: `linkedin:<sessionId>:inventory`, `linkedin:<sessionId>:profile:<urlHash>` e `linkedin:<sessionId>:finalize`.

- [ ] **Step 3: Implementar handlers com orçamento temporal, não de LLM**

Coleta usa timeout da sessão e não consome tokens. Depois de cada snapshot, chamar a camada de inferência existente com dados estruturados e então atualizar matching. Ao receber `cancelled`, `needs_attention` ou `paused_rate_limit`, cancelar tarefas pendentes da sessão.

- [ ] **Step 4: Ampliar inferências preservando fatos e evidências**

Adicionar sinais de progressão, skills, educação, empresas, Big Three, BTG/XP/Goldman, ITA/IME/USP/UNICAMP/federais/Insper/Inteli/Link, MBA Harvard/Stanford e exterior ao contexto já aprovado. Toda conclusão retorna `evidence`, `confidence`, `model`/`ruleVersion`; não usar instituição como decisão automática de contratação.

- [ ] **Step 5: Testar fallback sem LLM e proteção de dados**

Com OpenRouter/Gemini indisponíveis, regras determinísticas ainda geram ranking. Prompts não recebem cookies, HTML ou URL de sessão. Um perfil incompleto produz hipótese de baixa confiança, não fatos inventados.

- [ ] **Step 6: Rodar worker tests, migration e commit**

Run: `npm test -- src/lib/orchestration src/lib/platform/networkCapital.test.ts`

Run: `npm run db:migrate`

Expected: PASS e migração idempotente.

Commit: `git add scripts src/lib/orchestration src/lib/platform/networkCapital* && git commit -m "feat: enrich and infer LinkedIn profiles progressively"`

---

## Task 7: Expor APIs autenticadas, SSE e watchdog

**Files:**
- Create: `src/app/api/linkedin/sessions/route.ts`
- Create: `src/app/api/linkedin/sessions/[id]/route.ts`
- Create: `src/app/api/linkedin/sessions/[id]/cancel/route.ts`
- Create: `src/app/api/linkedin/sessions/[id]/events/route.ts`
- Create: `src/app/api/internal/linkedin/watchdog/route.ts`
- Create: `src/lib/linkedin/api.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Ler a documentação Next 16 aplicável**

Run: `rg -n "Route Handlers|streaming|Content-Security-Policy|headers" node_modules/next/dist/docs`

Abrir os guias encontrados antes de implementar handlers ou headers.

- [ ] **Step 2: Escrever testes de contrato e autorização**

Cobrir `401` sem sessão, `403/404` para outro dono, `409` ao atingir limite, `503` quando desligado/não configurado, `201` com `sessionId` e LiveURL segura, cancelamento idempotente e DTO sem referência interna.

- [ ] **Step 3: Implementar criação, leitura e cancelamento**

`POST /api/linkedin/sessions` aceita somente `{ consent: true }`. O ator vem do cookie. O retorno contém `session`, `interactiveUrl` e `expiresAt`; headers usam `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.

- [ ] **Step 4: Implementar SSE de baixo acoplamento**

Emitir `session` com DTO público, heartbeat a cada 15 segundos e finalizar ao chegar em estado terminal ou quando o cliente desconectar. Consultar estado por versão/intervalo curto; nunca enviar logs do provider.

- [ ] **Step 5: Implementar watchdog autenticado internamente**

Validar `Authorization: Bearer ${CRON_SECRET}`, localizar sessões expiradas/orfãs e executar limpeza idempotente. Retornar apenas contagens. Preparar chamada pelo serviço worker ou cron Railway.

- [ ] **Step 6: Aplicar CSP/referrer policy à página de conexão**

Impedir que LiveURL vá para `Referer`; não incluir a LiveURL em analytics, query strings internas ou mensagens de erro.

- [ ] **Step 7: Rodar testes e commit**

Run: `npm test -- src/lib/linkedin/api.test.ts`

Expected: PASS.

Commit: `git add src/app/api/linkedin src/app/api/internal src/lib/linkedin next.config.ts && git commit -m "feat: expose secure LinkedIn session APIs"`

---

## Task 8: Substituir a UI antiga pela jornada mobile-first aprovada

**Files:**
- Create: `src/components/platform/LinkedInRemoteConnector.tsx`
- Create: `src/components/platform/LinkedInRemoteConnector.test.tsx`
- Create: `src/app/linkedin/session/[id]/page.tsx`
- Create: `src/app/linkedin/session/[id]/LinkedInSessionClient.tsx`
- Modify: `src/components/platform/AdminNetworkConnections.tsx`
- Modify: `src/components/platform/MemberForms.tsx`
- Delete: `src/components/platform/useLinkedInBrowserSync.ts`
- Delete: `public/referral-copilot-linkedin-connector.zip`
- Delete: `browser-extension/manifest.json`
- Delete: `browser-extension/background.js`
- Delete: `browser-extension/content.js`
- Delete: `browser-extension/README.md`

- [ ] **Step 1: Adicionar dependência de teste DOM se necessária e testar estados da UI**

Cobrir viewport de 360 px, consentimento, abertura síncrona de aba de preparação, fallback quando popup é bloqueado, status via SSE, contador `N de M`, resultados iniciais, ação `Encerrar agora` e recuperação de falha.

- [ ] **Step 2: Implementar o componente compartilhado**

Copy principal aprovada:

```text
Conecte sua rede
Uma sessão privada será aberta. Entre diretamente no LinkedIn e deixe o mapeamento acontecer.
Continuar com LinkedIn →
Login normal em tela isolada · Rede mapeada automaticamente · Sessão apagada ao concluir
```

O clique deve executar `window.open("/linkedin/session/preparing", ...)` no gesto do usuário, registrar consentimento, criar a sessão e navegar a aba aberta. Se bloqueada, oferecer `Continuar nesta aba`.

- [ ] **Step 3: Implementar página de sessão e progresso**

A página autenticada valida propriedade do ID, abre a LiveURL apenas durante `awaiting_login` e continua exibindo progresso no app principal. Em telas pequenas, ações têm no mínimo 44 px e o conteúdo não cria rolagem horizontal.

- [ ] **Step 4: Remover integralmente a fricção antiga**

Apagar extensão/ZIP e remover toda referência visível a `extensão`, `conector`, `console`, `arquivo`, `upload`, `connections.json`, `chrome://extensions` e `modo desenvolvedor`.

- [ ] **Step 5: Rodar busca de regressão, testes, lint e commit**

Run: `rg -ni "chrome://extensions|modo desenvolvedor|connections\.json|referral-copilot-linkedin-connector|baixar extrator|selecionar arquivo" src public browser-extension`

Expected: zero resultados e `browser-extension` inexistente.

Run: `npm test -- src/components/platform/LinkedInRemoteConnector.test.tsx`

Run: `npm run lint`

Commit: `git add -A && git commit -m "feat: deliver no-install LinkedIn connection journey"`

---

## Task 9: Docker, observabilidade segura e execução local

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `README.md`
- Create: `docs/runbooks/linkedin-remote-sync.md`
- Create: `src/lib/linkedin/safeLogger.ts`
- Create: `src/lib/linkedin/safeLogger.test.ts`

- [ ] **Step 1: Testar redaction de observabilidade**

Ocultar chaves `token`, `cookie`, `authorization`, `password`, `providerSessionReference`, query `token=` e URLs websocket. Logs permitidos: session ID, owner type, status, contagens, duração e código de falha seguro.

- [ ] **Step 2: Passar configuração ao web/worker sem embutir segredo na imagem**

Compose referencia variáveis do ambiente. Dockerfile não usa `ARG BROWSERLESS_API_TOKEN`. Web e worker compartilham apenas nomes de configuração necessários.

- [ ] **Step 3: Documentar runbook operacional**

Incluir ativação/desativação da feature flag, health check, limite concorrente, verificação de sessão órfã, cancelamento, sinais de rate limit e rollback. Não incluir valores reais de chave.

- [ ] **Step 4: Validar localmente com provider fake**

Run: `docker compose up --build -d`

Run: `docker compose ps`

Run: `docker compose logs --tail=100 web worker`

Expected: web e worker healthy, schema pronto, nenhum segredo ou erro de migration.

- [ ] **Step 5: Rodar suite completa e build**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: todos exit `0`.

- [ ] **Step 6: Commit**

Commit: `git add Dockerfile docker-compose.yml README.md docs/runbooks src/lib/linkedin && git commit -m "ops: harden LinkedIn sync runtime and runbook"`

---

## Task 10: Teste real controlado, produção Railway e aceite

**Files:**
- Create: `docs/verification/2026-08-20-linkedin-pilot.md`
- Modify: `docs/runbooks/linkedin-remote-sync.md`

- [ ] **Step 1: Fazer preflight sem imprimir segredos**

Confirmar apenas presença de `BROWSERLESS_API_TOKEN`, `APP_SECRET`, `DATABASE_URL`, `CRON_SECRET` e flags no ambiente. Nunca executar comando que escreva o valor no terminal, PDF, log ou Git.

- [ ] **Step 2: Testar sessão real local com a conta do usuário**

Fluxo: admin autenticado → consentimento → LiveURL → login normal → inventário → um perfil enriquecido → recomendação incremental → `Encerrar agora`. Confirmar que uma nova sessão não herda login/cookies.

- [ ] **Step 3: Validar isolamento com membro de teste**

Executar o mesmo fluxo como membro e confirmar por API/UI que o admin não consegue listar sessão, snapshots ou contatos do membro.

- [ ] **Step 4: Registrar evidência não sensível**

No documento de verificação registrar commit, horário, estados percorridos, contagens, tempos, headers, resultado dos gates e IDs operacionais. Redigir nomes reais e excluir URLs temporárias, cookies e tokens.

- [ ] **Step 5: Fazer push somente após todos os gates verdes**

Run: `git status --short`

Run: `git log --oneline --decorate -10`

Run: `git push origin main`

Expected: push aceito e worktree limpa.

- [ ] **Step 6: Configurar Railway sem expor valores e observar deploy**

Definir as variáveis por CLI/dashboard seguro, habilitar a flag e acompanhar status, build e runtime. Não tratar o webhook como evidência suficiente; confirmar deployment `SUCCESS`, logs do web/worker e health HTTP.

- [ ] **Step 7: Executar smoke test de produção**

Validar desktop e mobile:

1. entrada admin e membro;
2. botão sem extensão/upload;
3. consentimento e aba temporária;
4. estado SSE;
5. inventário e pelo menos um enriquecimento real;
6. cancelamento/limpeza;
7. ausência de localhost em qualquer URL;
8. `Cache-Control: no-store` e `Referrer-Policy: no-referrer` nas rotas sensíveis;
9. logs sem segredos.

- [ ] **Step 8: Rollback se qualquer gate crítico falhar**

Desligar `LINKEDIN_REMOTE_SYNC_ENABLED` e manter Google, vagas, convites e inferências disponíveis. Não deixar o provider acessível com UI parcialmente quebrada.

- [ ] **Step 9: Commit da evidência final**

Commit: `git add docs/verification docs/runbooks && git commit -m "docs: record LinkedIn pilot verification"`

## Final Definition of Done

- [ ] Nenhuma pessoa instala extensão, abre console ou envia arquivo.
- [ ] Admin e membro usam a mesma jornada com autorização isolada.
- [ ] O login ocorre no Browserless e nenhuma credencial fica no Referral Copilot.
- [ ] Inventário aparece antes do enriquecimento total.
- [ ] Perfis trazem o máximo de fatos profissionais visíveis, com origem e confiança.
- [ ] Inferência usa fatos estruturados e distingue hipótese de evidência.
- [ ] CAPTCHA, checkpoint e rate limit pausam sem bypass.
- [ ] Cancelamento, timeout, sucesso e erro destroem a sessão e apagam a referência.
- [ ] Suite, lint, build, Docker, Railway e smoke tests estão verdes.
- [ ] Produção não gera URL `localhost` e pode desligar a integração por feature flag.
