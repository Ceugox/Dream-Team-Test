# Referral Copilot

Plataforma privada de indicações profissionais. O administrador publica vagas e convida a equipe; cada membro conecta a própria rede, recebe sugestões de pessoas aderentes e decide individualmente o que compartilhar.

## Acesso para avaliação

- **Aplicação em produção:** <https://referral-copilot-mvp-production.up.railway.app>
- A **chave de administrador** e os **links de convite** dos avaliadores são enviados por canal privado (não ficam neste repositório).
- Fluxo sugerido: entrar como administrador → instalar o conector (zip servido pela própria aplicação em `/referral-copilot-linkedin-connector.zip`) → conectar a rede → criar uma vaga e ver as sugestões imediatas.
- **Recomendação:** use o Google Chrome e desative extensões de bloqueio (ad-block e similares) durante a extração — elas podem interferir na coleta.

## Fluxo do produto

1. Cada administrador entra com identidade própria, conecta sua rede e publica as vagas prioritárias.
2. O administrador cria convites individuais, válidos por sete dias.
3. O colega aceita o convite e acessa uma área privada.
4. O colega clica em **Conectar pelo conector**: a extensão local abre o LinkedIn na sessão que ele já usa e mapeia as conexões visíveis.
5. O motor cruza cargo, senioridade, competências, empresa e localização com as vagas ativas.
6. Somente quando o colega confirma uma indicação, nome, perfil e contexto da relação ficam visíveis ao administrador.
7. Para cada vaga aberta, a plataforma separa potenciais candidatos de pessoas que provavelmente podem indicar alguém.
8. O administrador prepara mensagens individuais e abre cada conversa no WhatsApp com o texto preenchido.

O administrador nunca recebe uma listagem da rede privada dos membros.

## Produto entregue

- Dashboard administrativo com métricas reais.
- Cadastro persistente de vagas.
- Convites assinados, expiráveis e vinculáveis a e-mail.
- Onboarding e sessão privada para cada membro.
- Conector de navegador (extensão Chrome/Edge) para administradores e membros, sem credenciais na aplicação.
- Classificador heurístico de área de atuação (12 áreas) a partir de cargo e stack, com override manual.
- Edição de contatos na própria tela: contexto profissional, telefone e área.
- Insights agregados da rede gerados em segundo plano após cada sincronização.
- Convites com ciclo completo: criar, revogar, excluir e regenerar link.
- Ranking de oportunidades por aderência profissional.
- Consentimento explícito por indicação.
- Pipeline administrativo com status de acompanhamento.
- Oito fases de vaga, do rascunho ao preenchimento ou cancelamento.
- Redes privadas para múltiplos administradores.
- Matching explicável de potenciais candidatos e potenciais indicadores.
- Fila click-to-chat com mensagens personalizadas e histórico operacional.
- PostgreSQL e migração idempotente no start da aplicação.
- Interface responsiva inspirada em ferramentas modernas de desenvolvedor.
- Orquestrador assíncrono em DAG com worker independente, orçamento, auditoria e retentativas.

## Segurança e privacidade

- Cookies de sessão assinados, `httpOnly`, `sameSite=lax` e `secure` em produção.
- Chave administrativa comparada em tempo constante.
- Tokens de convite aleatórios; apenas o hash é persistido.
- Convites usados são invalidados dentro de transação com bloqueio de linha.
- Contatos ficam isolados por membro e não possuem rota administrativa de listagem.
- Indicações registram os campos que receberam consentimento.
- A senha do LinkedIn nunca passa pela aplicação. A extração usa a sessão já autenticada do próprio usuário.

## Executar localmente

Requisitos: Node.js 20+ e PostgreSQL.

```bash
npm install
npm run db:migrate
npm run dev
```

Crie um `.env.local`:

```dotenv
DATABASE_URL=postgresql://usuario:senha@localhost:5432/referral_copilot
APP_SECRET=troque-por-um-segredo-longo-e-aleatorio
ADMIN_ACCESS_KEY=troque-por-uma-chave-administrativa
APP_URL=http://localhost:3000
```

`APP_SECRET` e `ADMIN_ACCESS_KEY` são **obrigatórias em qualquer ambiente**: não existe valor padrão. Sem `APP_SECRET` a aplicação falha ao assinar a sessão; sem `ADMIN_ACCESS_KEY` o login do administrador recusa todo mundo. O login também tem teto de 8 tentativas por IP a cada 10 minutos.

Acesse `http://localhost:3000`. A raiz oferece os acessos de administrador e usuário convidado.

## Ambiente Docker isolado

O Docker Compose sobe três serviços independentes: `web`, `worker` e `postgres`. O banco usa um volume local e nunca aponta para o Railway.

```bash
cp .env.docker.example .env.docker
docker compose up --build
```

Acesse `http://localhost:3100` e use a chave administrativa local definida em `.env.docker`. Hot reload permanece ativo; web e worker aguardam o healthcheck do PostgreSQL antes de iniciar.

```bash
docker compose ps
docker compose logs -f web worker postgres
docker compose down
```

`docker compose down` preserva os dados. Para apagar também o banco local, use `docker compose down -v` somente quando a perda desses dados for intencional.

## WhatsApp

A integração inicial usa o click-to-chat oficial: o botão abre `wa.me` com o telefone e a mensagem já preenchidos. O administrador não copia texto, mas revisa e pressiona **Enviar** no WhatsApp Desktop ou Web.

- Cadastre números com código do país; números brasileiros sem `+55` são normalizados automaticamente.
- A aplicação registra `prepared` e `opened`, mas não afirma entrega ou leitura.
- `Envio confirmado`, `Respondeu`, `Indicou alguém` e `Sem retorno` são estados registrados manualmente.
- Não há automação do DOM do WhatsApp Web nem disparo silencioso em massa.
- Uma futura WhatsApp Business Cloud API pode substituir o gateway sem alterar o fluxo de vaga.

## LinkedIn

Administradores e membros usam a mesma jornada: o botão **Conectar pelo conector** aciona a extensão local de navegador (`browser-extension/`, Chrome ou Edge), que abre o LinkedIn na própria sessão do usuário e mapeia as conexões visíveis. A extensão devolve os contatos para `/api/admin/network` (ou `/api/member/linkedin`) em `mode: "browser-sync"`, e a persistência é um upsert incremental por `linkedin_url` — resincronizar nunca reduz a rede já coletada.

Nenhuma senha ou cookie passa pela aplicação: o login acontece no navegador do próprio usuário, e a plataforma recebe apenas nome, headline e URL pública de cada conexão. A importação do Google Contacts é implementação futura e está desativada.

Recomendação de ambiente: Google Chrome com extensões de bloqueio (ad-block e similares) desativadas durante a extração — bloqueadores podem esconder cards da lista de conexões e reduzir a completude da coleta.

## Arquitetura

```mermaid
flowchart LR
  A[Administradores] --> N[Redes administrativas privadas]
  A --> J[Vagas]
  A --> I[Convites]
  I --> M[Área privada do membro]
  M --> L[Conector de navegador]
  A --> L
  L --> P[(PostgreSQL)]
  J --> R[Motor de ranking]
  J --> Q[(Fila de inteligência)]
  Q --> WK[Worker especializado]
  WK --> R
  P --> R
  R --> O[Oportunidades privadas]
  O -->|consentimento explícito| F[Indicação]
  F --> A
  N --> R2[Candidatos e possíveis indicadores]
  J --> R2
  R2 --> W[Fila WhatsApp click-to-chat]
```

- Next.js 16 e React 19 no frontend e backend.
- Route Handlers para autenticação, vagas, convites, importação e indicações.
- PostgreSQL com `pg`, chaves estrangeiras, índices e transações.
- Zod na validação dos dados importados.
- Vitest para domínio, autenticação, resolução de identidade e ranking.
- Fila PostgreSQL com leases, `SKIP LOCKED`, dependências, idempotência e até três tarefas paralelas.

## Orquestrador de inteligência

Ao criar uma vaga aberta, o ranking determinístico é calculado e **gravado em lote no próprio request** — a vaga já abre populada, sem depender da fila. O serviço web apenas cria workflows; o serviço `intelligence-worker` executa as tarefas em segundo plano com `npm run worker`. Os pipelines usam quatro especialistas: `job_analysis`, `profile_enrichment`, `match_rerank` e `network_insights`. Cada handoff possui payload validado, orçamento de tokens, timeout, dependências e até três tentativas com backoff exponencial. Se a inferência falhar, o ranking determinístico permanece — a vaga nunca fica sem recomendações por falha de LLM.

`network_insights` é disparada automaticamente ao fim de cada sincronização e resume a rede (composição por área, cobertura de contato, lacunas). O prompt recebe **apenas agregados** — nenhum nome ou dado pessoal — e há fallback determinístico quando não existe provedor configurado.

O Gemini analisa descrições de vagas sem dados pessoais. O OpenRouter/DeepSeek faz o reranking pseudonimizado e a pesquisa pública continua exigindo provedores com retenção zero. O painel **Admin → Inteligência** mostra progresso, tokens, orçamento estimado e falhas definitivas.

## Scripts operacionais

Rodam da máquina local contra o Postgres do Railway (CLI logado e projeto linkado); resolvem a URL pública do banco sozinhos:

- `node scripts/seed-demo-railway.mjs` — popula vagas, membros, indicações e funil de demonstração com as conexões reais já sincronizadas (idempotente).
- `node scripts/create-evaluator-invites.mjs [n]` — cria `n` convites de membro sem e-mail (uso único, 7 dias) e imprime as URLs.
- `node scripts/diagnose-empty-jobs-railway.mjs` — read-only: para cada vaga aberta sem recomendações, mostra o que o parser extraiu, os maiores scores da rede contra os limiares e o estado da fila.

## Comandos de qualidade

```bash
npm test
npm run lint -- --max-warnings=0
npm run build
npm audit --omit=dev
```

## Operação no Railway

Configure `DATABASE_URL`, `APP_SECRET`, `ADMIN_ACCESS_KEY`, `OPENROUTER_API_KEY` e, opcionalmente, `GEMINI_API_KEY`. O serviço web usa `npm start`; o worker usa `npm run worker`, `WORKER_CONCURRENCY=3` e as mesmas referências de banco/modelos. Ambos executam a migração idempotente antes de iniciar.

As inferências analisam a vaga e reranqueiam somente os melhores resultados do motor determinístico. Perfis são enviados com identificadores opacos e sem nome, telefone, e-mail ou URL. Se o OpenRouter estiver indisponível, o ranking determinístico continua funcionando.

### Capital de rede

O matching de conectores reconhece sinais profissionais explícitos de formação, empresas anteriores e experiência internacional. O JSON administrativo pode incluir `education`, `experience`, `internationalExperience` ou `profileContext`; há um modelo em `public/network-profile-template.json`.

Esses sinais têm contribuição limitada, são exibidos com evidência e confiança e influenciam somente a hipótese de que alguém possa conhecer bons candidatos. Não elevam o fit de candidato, não substituem avaliação profissional e a ausência de pedigree reconhecido nunca reduz a pontuação.

### Classificação de área

`inferArea` deriva a área de atuação (Engenharia de Software, Dados & IA/ML, Produto, Design, Growth & Marketing, Vendas & GTM, Finanças & Investimentos, RH & Talent, Consultoria & Estratégia, Jurídico, Operações, Academia & Pesquisa) a partir do cargo e da stack declarados. É determinística, versionada por regra e explicável — sem LLM. Quando a área do contato coincide com a área da vaga, o conector recebe um acréscimo limitado e a evidência aparece na recomendação. O administrador pode sobrepor a área manualmente e o override sempre vence a inferência.

A área da **vaga** sai de `inferJobArea`, que decide pelo cargo e só recorre à descrição quando o cargo é inconclusivo: descrição de vaga cita times e ferramentas de outras áreas ("roadmap com o time de engenharia", "analytics") e desviava a classificação.

### Fit de candidato por evidência

`computeCandidateFit` pontua seis dimensões — competências (.35), área (.30), cargo (.25), senioridade (.15), setor (.15) e localização (.10) — mas **só entra na conta a dimensão com evidência dos dois lados**, e o score é a média ponderada apenas do que foi medido. Dimensão desconhecida não vale meio ponto: ela sai da conta.

Isso importa porque o conector do LinkedIn coleta nome e headline, nunca localização. No modelo antigo, setor e localização desconhecidos somavam 0,125 contra um limiar de 0,14 — qualquer pessoa entrava em qualquer vaga, e "potenciais candidatos" era, na prática, a rede inteira. Complementos da calibragem:

- **Senioridade igual, sozinha, não qualifica**: é exigido pelo menos um sinal de substância (competências, cargo ou área).
- **Palavra genérica de hierarquia não conta como cargo**: "Analista" casava com Analista Financeiro, de Marketing e de Suporte igualmente (`meaningfulTitleTerms`).
- **`evidenceCoverage`** informa quanto do peso total foi medido, e a confiança da recomendação acompanha esse número: pouca informação, pouca confiança.
- **Vocabulário em PT-BR** (`src/lib/matching/vocabulary.ts`): senioridade com acento (`/\bs[êe]nior\b/` — `senior` não casa "Sênior"), skills além de tecnologia (finanças, RH, design, growth) e setores em português. O limiar de candidato é `CANDIDATE_FIT_THRESHOLD`.

### Google Contacts

A importação do Google é **implementação futura**: o cartão aparece desabilitado e o endpoint responde `503` a menos que `GOOGLE_IMPORT_ENABLED=true`. Nenhum dado fictício é exibido quando a integração não está configurada.

### Enriquecimento público (desligado por padrão)

O enriquecimento por busca web é o **único** caminho do produto que envia dado pessoal identificável para fora — nome e URL de LinkedIn do contato vão ao provedor de LLM. Por isso ele responde `503` e nem chega a fazer requisição a menos que `ENRICHMENT_ENABLED=true`. Ligue apenas com base legal para tratar esses dados; todo o resto da inteligência (insights da rede, rerank de match) trabalha só com agregados e identificadores opacos.

Há dois modos, ambos em segundo plano pela fila:

- **Varredura da rede** (`POST /api/admin/network/enrich` sem corpo, botão em Rede): até 8 perfis, escolhidos por quem nunca foi pesquisado ou passou de 30 dias.
- **Topo de uma vaga** (`{ "jobId": "…", "limit": 10 }`, botão na tela da vaga): pesquisa só os melhores ranqueados daquela vaga, na ordem do score. Perfil já pesquisado nos últimos 7 dias é ignorado, para o mesmo clique não gastar tokens duas vezes.
