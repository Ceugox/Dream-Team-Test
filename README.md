# Referral Copilot

Plataforma privada de indicações profissionais. O administrador publica vagas e convida a equipe; cada membro conecta a própria rede, recebe sugestões de pessoas aderentes e decide individualmente o que compartilhar.

## Fluxo do produto

1. Cada administrador entra com identidade própria, conecta sua rede e publica as vagas prioritárias.
2. O administrador cria convites individuais, válidos por sete dias.
3. O colega aceita o convite e acessa uma área privada.
4. O colega gera um `connections.json` dentro da própria sessão do LinkedIn e importa o arquivo.
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
- Importação de conexões do LinkedIn sem armazenar credenciais.
- Ranking de oportunidades por aderência profissional.
- Consentimento explícito por indicação.
- Pipeline administrativo com status de acompanhamento.
- Oito fases de vaga, do rascunho ao preenchimento ou cancelamento.
- Redes privadas para múltiplos administradores.
- Matching explicável de potenciais candidatos e potenciais indicadores.
- Fila click-to-chat com mensagens personalizadas e histórico operacional.
- PostgreSQL e migração idempotente no start da aplicação.
- Interface responsiva inspirada em ferramentas modernas de desenvolvedor.

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
```

Acesse `http://localhost:3000`. A raiz oferece os acessos de administrador e usuário convidado.

## WhatsApp

A integração inicial usa o click-to-chat oficial: o botão abre `wa.me` com o telefone e a mensagem já preenchidos. O administrador não copia texto, mas revisa e pressiona **Enviar** no WhatsApp Desktop ou Web.

- Cadastre números com código do país; números brasileiros sem `+55` são normalizados automaticamente.
- A aplicação registra `prepared` e `opened`, mas não afirma entrega ou leitura.
- `Envio confirmado`, `Respondeu`, `Indicou alguém` e `Sem retorno` são estados registrados manualmente.
- Não há automação do DOM do WhatsApp Web nem disparo silencioso em massa.
- Uma futura WhatsApp Business Cloud API pode substituir o gateway sem alterar o fluxo de vaga.

## LinkedIn

O arquivo `public/linkedin-console-script.js` é executado pelo próprio membro na página de conexões do LinkedIn. Ele lê somente os elementos já visíveis na sessão autenticada e baixa um JSON local. A tela **Conexões** contém o passo a passo e o botão de download do extrator.

Essa abordagem não tenta contornar autenticação, CAPTCHA ou mecanismos de proteção e evita o armazenamento de senha/cookie do LinkedIn. Como depende da estrutura visual da página, o seletor pode exigir manutenção quando o LinkedIn alterar a interface.

## Arquitetura

```mermaid
flowchart LR
  A[Administradores] --> N[Redes administrativas privadas]
  A --> J[Vagas]
  A --> I[Convites]
  I --> M[Área privada do membro]
  M --> L[Importação LinkedIn]
  L --> P[(PostgreSQL)]
  J --> R[Motor de ranking]
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

## Comandos de qualidade

```bash
npm test
npm run lint -- --max-warnings=0
npm run build
npm audit --omit=dev
```

## Operação no Railway

Configure `DATABASE_URL`, `APP_SECRET`, `ADMIN_ACCESS_KEY` e `OPENROUTER_API_KEY` no serviço. `OPENROUTER_MODEL` é opcional e usa `deepseek/deepseek-v4-flash-0731` por padrão. O comando `npm start` executa a migração idempotente e inicia o Next.js. O PostgreSQL pode ser conectado por referência interna do Railway.

As inferências analisam a vaga e reranqueiam somente os melhores resultados do motor determinístico. Perfis são enviados com identificadores opacos e sem nome, telefone, e-mail ou URL. Se o OpenRouter estiver indisponível, o ranking determinístico continua funcionando.

Google Contacts e Calendar estão apresentados como integrações futuras porque exigem credenciais OAuth do proprietário do produto. Nenhum dado fictício dessas fontes é exibido na experiência entregue.
