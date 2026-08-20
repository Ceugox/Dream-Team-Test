# Admin Network and WhatsApp Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar redes privadas de múltiplos administradores em recomendações de candidatos e indicadores por vaga, com ciclo de vida completo e mensagens click-to-chat do WhatsApp.

**Architecture:** Manter a aplicação Next.js/PostgreSQL atual e acrescentar identidade administrativa, contatos de rede administrativos, recomendações materializadas e solicitações de abordagem. O scoring permanece determinístico e explicável; o WhatsApp usa um gateway click-to-chat, sem automatizar o clique de envio.

**Tech Stack:** Next.js 16.3.1, React 19.1, TypeScript, PostgreSQL, Zod 4, Vitest, Tailwind CSS 4.

## Global Constraints

- Redes privadas não podem ser expostas como listas navegáveis para outros owners.
- Apenas vagas `open` geram novas recomendações e aparecem para usuários convidados.
- URLs do WhatsApp usam telefones normalizados em E.164 e mensagens codificadas.
- Abrir uma conversa registra `opened`, nunca `sent` ou `delivered`.
- A interface deve continuar mobile first, acessível por teclado e utilizável em 320 px.
- Migrações devem ser idempotentes e compatíveis com o banco já publicado.
- Nenhuma senha, cookie ou token de LinkedIn é armazenado.

---

### Task 1: Domínio de fases, telefone e WhatsApp

**Files:**
- Create: `src/lib/platform/jobLifecycle.ts`
- Create: `src/lib/platform/jobLifecycle.test.ts`
- Create: `src/lib/platform/whatsapp.ts`
- Create: `src/lib/platform/whatsapp.test.ts`
- Modify: `src/lib/platform/types.ts`

**Interfaces:**
- Produces: `JobStatus`, `canTransitionJob(from, to)`, `normalizePhone(value, defaultCountry)`, `buildWhatsAppUrl(phone, message)`.

- [ ] Escrever testes para as oito fases, transições terminais, telefones brasileiros e codificação de mensagem.
- [ ] Executar `npm test -- src/lib/platform/jobLifecycle.test.ts src/lib/platform/whatsapp.test.ts` e confirmar falha por módulos ausentes.
- [ ] Implementar a matriz de transição e um normalizador que aceite `+55`, `55` e números brasileiros com DDD.
- [ ] Implementar `buildWhatsAppUrl` como `https://wa.me/<digits>?text=<encodeURIComponent(message)>`.
- [ ] Executar os testes focados e confirmar aprovação.
- [ ] Commitar domínio e testes.

### Task 2: Persistência idempotente

**Files:**
- Modify: `scripts/migrate.mjs`
- Modify: `src/lib/platform/types.ts`
- Modify: `src/lib/platform/repository.ts`

**Interfaces:**
- Produces: `Administrator`, `AdminNetworkContact`, `NetworkRecommendation`, `OutreachRequest` e operações de repositório.
- Consumes: `JobStatus` da Task 1.

- [ ] Adicionar `administrators`, `admin_network_contacts`, `network_recommendations`, `outreach_requests` e `outreach_events` com FKs e índices por organização/vaga.
- [ ] Migrar o constraint de `jobs.status` de forma idempotente para as oito fases e converter `active` em `open`, `closed` em `filled`.
- [ ] Implementar `upsertAdministrator`, `getAdministrator`, `replaceAdminNetworkContacts`, `listAdminNetworkContacts`, `getJob`, `updateJobStatus`, `listJobRecommendations`, `createOutreachRequests` e `updateOutreachStatus`.
- [ ] Garantir que todas as queries recebam `organization_id` e que contatos não sejam retornados fora de recomendações acionáveis.
- [ ] Executar `npm test` e `npm run build`.
- [ ] Commitar migração e repositório.

### Task 3: Identidade administrativa individual

**Files:**
- Modify: `src/lib/platform/auth.ts`
- Modify: `src/lib/platform/auth.test.ts`
- Modify: `src/app/api/admin/login/route.ts`
- Modify: `src/components/platform/AdminLoginForm.tsx`
- Modify: `src/app/(platform)/admin/layout.tsx`

**Interfaces:**
- Produces: `AdminSession`, `getAdminSession()`, `setAdminSession(administratorId, organizationId)`.
- Consumes: `upsertAdministrator` e `getAdministrator` da Task 2.

- [ ] Estender testes de assinatura/expiração para `administratorId` e `organizationId`.
- [ ] Fazer o login receber chave, nome e e-mail; validar com Zod e criar/recuperar a identidade administrativa.
- [ ] Persistir o ID no cookie assinado sem colocar nome ou e-mail no cliente.
- [ ] Exibir o nome do administrador no `AppShell` e preservar compatibilidade redirecionando sessões antigas ao login.
- [ ] Executar testes de auth, lint e build.
- [ ] Commitar identidade administrativa.

### Task 4: Importação da rede administrativa

**Files:**
- Create: `src/app/(platform)/admin/rede/page.tsx`
- Create: `src/app/api/admin/network/route.ts`
- Create: `src/components/platform/AdminNetworkForms.tsx`
- Create: `src/lib/platform/adminNetwork.ts`
- Create: `src/lib/platform/adminNetwork.test.ts`
- Modify: `src/components/platform/AppShell.tsx`

**Interfaces:**
- Produces: `parseAdminNetworkFile`, `scoreConnectorFit`, upload JSON e cadastro/edição de telefone.
- Consumes: sessão administrativa e repositório das Tasks 2 e 3.

- [ ] Criar fixtures de LinkedIn com e sem telefone e testes de parsing/deduplicação.
- [ ] Implementar parser limitado por tamanho, normalização de headline/profile URL e telefone.
- [ ] Criar endpoint `GET/POST/PATCH /api/admin/network` protegido por identidade e organização.
- [ ] Criar página “Minha rede” com cobertura, upload do JSON e cadastro manual de nome/headline/WhatsApp.
- [ ] Adicionar “Rede” à navegação administrativa sem quebrar a barra mobile.
- [ ] Executar testes focados, lint e build.
- [ ] Commitar ingestão administrativa.

### Task 5: Matching de candidatos e indicadores

**Files:**
- Create: `src/lib/platform/adminMatching.ts`
- Create: `src/lib/platform/adminMatching.test.ts`
- Create: `src/app/api/admin/jobs/[id]/recommendations/route.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/app/api/admin/jobs/route.ts`

**Interfaces:**
- Produces: `buildAdminRecommendations(job, contacts)` e `refreshAdminRecommendations(jobId)`.
- Consumes: `computeCandidateFit`, `parseJobDescription`, `scoreConnectorFit`.

- [ ] Escrever testes que separem `candidate_fit` e `connector_fit`, permitam ambos e incluam evidências observadas/inferidas.
- [ ] Converter contatos em `Person`, calcular fit de candidato e fit de indicador e aplicar limiares explícitos.
- [ ] Materializar recomendações por vaga e owner com versão do algoritmo e upsert idempotente.
- [ ] Fazer criação/abertura da vaga atualizar recomendações sem bloquear a persistência da vaga em caso de fallback.
- [ ] Criar endpoint de consulta/refresh protegido.
- [ ] Executar testes focados e suite completa.
- [ ] Commitar matching administrativo.

### Task 6: Fases e central operacional da vaga

**Files:**
- Create: `src/app/(platform)/admin/vagas/[id]/page.tsx`
- Create: `src/app/api/admin/jobs/[id]/route.ts`
- Create: `src/components/platform/JobWorkspace.tsx`
- Modify: `src/app/(platform)/admin/vagas/page.tsx`
- Modify: `src/components/platform/AdminForms.tsx`

**Interfaces:**
- Produces: página de detalhe, seletor de fase, abas de candidatos/indicadores e seleção de recomendações.
- Consumes: lifecycle, recomendações e APIs anteriores.

- [ ] Criar testes de rota para rejeitar transições inválidas e IDs fora da organização.
- [ ] Expor `PATCH /api/admin/jobs/:id` para fase e `GET` para visão completa.
- [ ] Alterar criação de vaga para aceitar `draft` ou `open`, mantendo `open` como padrão do fluxo rápido.
- [ ] Transformar cada card de vaga em link para o workspace e exibir badge da fase.
- [ ] Criar workspace mobile first com resumo, recomendações, evidências e estado vazio acionável.
- [ ] Executar lint, testes e build.
- [ ] Commitar central da vaga.

### Task 7: Fila click-to-chat

**Files:**
- Create: `src/app/api/admin/jobs/[id]/outreach/route.ts`
- Create: `src/app/api/admin/outreach/[id]/route.ts`
- Create: `src/components/platform/OutreachQueue.tsx`
- Modify: `src/app/(platform)/admin/vagas/[id]/page.tsx`
- Modify: `src/lib/platform/repository.ts`

**Interfaces:**
- Produces: preparação em lote, edição da mensagem, URL WhatsApp e eventos `prepared/opened/manually_confirmed_sent/replied/referred/no_response/cancelled`.
- Consumes: `buildWhatsAppUrl`, recomendações e sessão administrativa.

- [ ] Testar deduplicação por vaga/contato/finalidade e impedir abordagem de `do_not_contact` ou telefone inválido.
- [ ] Gerar mensagens determinísticas personalizadas para candidato ou indicador, sempre editáveis.
- [ ] Criar endpoint de lote e endpoint de atualização de mensagem/status.
- [ ] Ao clicar, registrar `opened` e então abrir a URL em nova aba com `noopener,noreferrer`.
- [ ] Criar fila com uma ação por destinatário, filtros por status e confirmação manual de resultado.
- [ ] Executar testes, lint e build.
- [ ] Commitar orquestração WhatsApp.

### Task 8: Compatibilidade do usuário e hardening

**Files:**
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/app/(member)/app/page.tsx`
- Modify: `src/app/(member)/app/oportunidades/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: novos estados da vaga.
- Produces: fluxo de usuário limitado a vagas `open` e documentação operacional.

- [ ] Atualizar queries do usuário e métricas para `open`.
- [ ] Confirmar que redes administrativas nunca aparecem nas respostas do usuário.
- [ ] Documentar formato do JSON, telefone E.164, limitações click-to-chat e futura Cloud API.
- [ ] Executar `npm test`, `npm run lint -- --max-warnings=0`, `npm run build` e `npm audit --omit=dev`.
- [ ] Validar manualmente landing, login, rede, vagas, workspace e fila em 320/390/768/1440 px.
- [ ] Commitar hardening e documentação.

### Task 9: Publicação

**Files:**
- No code files.

**Interfaces:**
- Produces: GitHub `main` e Railway no mesmo commit.

- [ ] Conferir `git diff --check` e árvore limpa.
- [ ] Fazer merge fast-forward para `main` e push para `origin/main`.
- [ ] Aguardar o Railway reportar `SUCCESS` para o hash enviado.
- [ ] Verificar logs de migração e inicialização.
- [ ] Verificar HTTP 200 e conteúdo das rotas públicas.
- [ ] Registrar o commit e URL final na entrega.

