# Referral Copilot

Plataforma privada de indicações profissionais. O administrador publica vagas e convida a equipe; cada membro conecta a própria rede, recebe sugestões de pessoas aderentes e decide individualmente o que compartilhar.

## Fluxo do produto

1. O administrador entra no workspace e publica as vagas prioritárias.
2. O administrador cria convites individuais, válidos por sete dias.
3. O colega aceita o convite e acessa uma área privada.
4. O colega gera um `connections.json` dentro da própria sessão do LinkedIn e importa o arquivo.
5. O motor cruza cargo, senioridade, competências, empresa e localização com as vagas ativas.
6. Somente quando o colega confirma uma indicação, nome, perfil e contexto da relação ficam visíveis ao administrador.

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

Acesse `http://localhost:3000`. A raiz encaminha para o login administrativo.

## LinkedIn

O arquivo `public/linkedin-console-script.js` é executado pelo próprio membro na página de conexões do LinkedIn. Ele lê somente os elementos já visíveis na sessão autenticada e baixa um JSON local. A tela **Conexões** contém o passo a passo e o botão de download do extrator.

Essa abordagem não tenta contornar autenticação, CAPTCHA ou mecanismos de proteção e evita o armazenamento de senha/cookie do LinkedIn. Como depende da estrutura visual da página, o seletor pode exigir manutenção quando o LinkedIn alterar a interface.

## Arquitetura

```mermaid
flowchart LR
  A[Administrador] --> J[Vagas]
  A --> I[Convites]
  I --> M[Área privada do membro]
  M --> L[Importação LinkedIn]
  L --> P[(PostgreSQL)]
  J --> R[Motor de ranking]
  P --> R
  R --> O[Oportunidades privadas]
  O -->|consentimento explícito| F[Indicação]
  F --> A
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

Configure `DATABASE_URL`, `APP_SECRET` e `ADMIN_ACCESS_KEY` no serviço. O comando `npm start` executa a migração idempotente e inicia o Next.js. O PostgreSQL pode ser conectado por referência interna do Railway.

Google Contacts e Calendar estão apresentados como integrações futuras porque exigem credenciais OAuth do proprietário do produto. Nenhum dado fictício dessas fontes é exibido na experiência entregue.
