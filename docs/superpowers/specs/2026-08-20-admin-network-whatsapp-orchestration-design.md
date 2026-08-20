# Referral Copilot — Redes de administradores e orquestração por WhatsApp

Data: 2026-08-20  
Status: aprovado conceitualmente; aguardando revisão final da especificação  
Base: plataforma Next.js existente com vagas, administradores, usuários convidados, redes privadas e indicações consentidas

## 1. Resultado esperado

O Referral Copilot passa a usar duas camadas de rede para cada vaga:

1. As fontes privadas de todos os administradores da organização ajudam a localizar potenciais candidatos e pessoas que provavelmente conhecem alguém aderente.
2. A rede privada de cada usuário convidado continua sendo analisada individualmente para sugerir as melhores pessoas que esse usuário pode indicar.

O administrador decide quem abordar. Para cada pessoa selecionada, o produto gera uma mensagem contextual e abre a conversa correta no WhatsApp Desktop ou WhatsApp Web com o texto preenchido. O administrador revisa e realiza o envio. Não existe cópia manual nem disparo invisível.

## 2. Princípios

- Redes são privadas por padrão e pertencem à pessoa que as importou.
- Administradores podem usar recomendações derivadas das redes administrativas, mas não navegar livremente pelos contatos brutos de outros administradores.
- Usuários convidados só veem sugestões calculadas sobre a própria rede.
- IA produz inferências explicadas, não fatos silenciosos.
- Toda mensagem de WhatsApp exige uma ação consciente do administrador antes do envio.
- O fluxo inicial funciona sem API paga e deixa um adaptador preparado para a WhatsApp Business Platform.
- A interface é mobile first, mas a operação de WhatsApp também funciona no desktop.

## 3. Papéis e visibilidade

### Administrador

- Possui identidade individual dentro da organização.
- Conecta as próprias fontes profissionais.
- Cria, edita e movimenta vagas.
- Consulta recomendações agregadas para cada vaga.
- Vê nome, contexto profissional, evidências e telefone apenas dos contatos administrativos que foram transformados em recomendação acionável.
- Seleciona quem receberá uma solicitação de indicação.
- Revisa a mensagem e abre a conversa no WhatsApp.
- Registra o resultado da abordagem.

### Usuário convidado

- Mantém a jornada atual de convite e área privada.
- Conecta LinkedIn e Google.
- Recebe sugestões calculadas exclusivamente sobre a própria rede.
- Confirma cada candidato antes de compartilhar uma indicação.
- Não recebe acesso às redes administrativas ou às redes de outros usuários.

## 4. Ciclo de vida das vagas

As vagas usam estados operacionais explícitos:

- `draft`: rascunho ainda não analisado.
- `open`: aberta para busca e indicações.
- `screening`: indicações em triagem.
- `interviewing`: candidatos em entrevistas.
- `offer`: oferta em andamento.
- `filled`: vaga preenchida.
- `paused`: busca temporariamente pausada.
- `cancelled`: vaga cancelada.

Transições usuais:

`draft → open → screening → interviewing → offer → filled`

`open`, `screening` e `interviewing` podem ir para `paused` e retornar ao estado anterior. Qualquer estado não terminal pode ir para `cancelled`. Apenas vagas `open` aparecem para usuários e geram novas recomendações.

## 5. Fontes e aquisição

Cada administrador e usuário possui conexões de fonte associadas à sua identidade:

- LinkedIn: importação pelo extrator local já adotado, sem captura de senha, cookie ou sessão.
- Google Contacts: importação estruturada na primeira entrega; OAuth poderá substituir o adaptador sem alterar o domínio.
- Google Calendar: sinais agregados de relacionamento quando a fonte estiver disponível, sem armazenar conteúdo de reuniões.
- Telefones: extraídos de fontes autorizadas ou cadastrados manualmente pelo administrador.

Telefones são normalizados para E.164, incluindo código do país. Um contato sem telefone continua participando do ranking, mas não pode entrar na fila de WhatsApp até que o administrador complete o número.

## 6. Inteligência por vaga

### Perfil estruturado da vaga

Ao salvar uma vaga, regras determinísticas e IA criam um núcleo versionado com:

- cargo e variações semânticas;
- senioridade;
- competências essenciais e desejáveis;
- empresas, setores e contextos relevantes;
- localização e modelo de trabalho;
- pesos e critérios eliminatórios;
- resumo curto usado nas mensagens.

O administrador pode revisar o núcleo antes de abrir a vaga.

### Recomendações administrativas

O motor analisa as fontes de todos os administradores e cria dois grupos independentes:

1. `candidate_fit`: pessoas com perfil aderente para a vaga.
2. `connector_fit`: pessoas com sinais de que podem conhecer candidatos adequados.

O segundo grupo é inferencial. O score considera histórico de empresa, setor, função, senioridade, comunidades profissionais, proximidade e força do relacionamento com o administrador dono da fonte. A interface sempre apresenta “por que pedir para esta pessoa?” e diferencia evidência observada de hipótese.

Um contato pode aparecer nos dois grupos. A interface permite escolher entre “abordar como candidato” e “pedir indicação”.

### Recomendações para usuários

Para cada usuário convidado, o motor continua analisando apenas sua rede LinkedIn + Google. O usuário vê os candidatos sugeridos, evidências de fit e força do relacionamento, mas nenhuma informação sobre as redes dos administradores ou de outros usuários.

## 7. Fluxo do administrador

1. O administrador entra em sua área e conecta as próprias fontes.
2. A organização exibe cobertura agregada das redes administrativas, sem listar contatos brutos.
3. Ao criar uma vaga, o administrador informa os dados e revisa o núcleo estruturado.
4. A vaga entra como `draft`; ao abrir, o matching é executado nas redes administrativas e nas redes dos usuários ativos.
5. A página da vaga exibe abas:
   - visão geral;
   - potenciais candidatos;
   - quem pode indicar;
   - solicitações WhatsApp;
   - indicações recebidas;
   - histórico.
6. O administrador seleciona pessoas individualmente ou em lote para preparar solicitações.
7. A IA gera uma mensagem por pessoa, usando nome, vaga, empresa e uma justificativa curta, sem expor dados de terceiros.
8. A fila mostra uma ação `Abrir no WhatsApp` por destinatário.
9. O clique abre `https://wa.me/<telefone>?text=<mensagem-codificada>` no WhatsApp Desktop ou Web.
10. O administrador revisa e pressiona `Enviar` no WhatsApp.
11. Ao retornar, registra o resultado: enviado, respondeu, indicou alguém, sem retorno ou não abordar novamente.

Abrir o WhatsApp registra `opened`, não `delivered`. Sem a API oficial, a plataforma não afirma que a mensagem foi enviada, entregue ou lida.

## 8. Mensagens

Mensagem padrão para pedido de indicação:

> Olá, {{nome}}! Estou buscando indicações para uma vaga de {{cargo}} na {{empresa}}. Pelo seu histórico em {{contexto}}, imaginei que talvez você conheça alguém adequado. Posso te enviar mais detalhes?

Mensagem padrão para potencial candidato:

> Olá, {{nome}}! Estou trabalhando em uma oportunidade de {{cargo}} na {{empresa}} e seu histórico em {{contexto}} chamou minha atenção. Posso compartilhar mais detalhes para entender se faz sentido para você?

Regras:

- O administrador pode editar antes de abrir o WhatsApp.
- O texto nunca afirma que a IA conhece a rede de segundo grau do destinatário.
- Mensagens respeitam uma lista de bloqueio e o status `do_not_contact`.
- A mesma pessoa não recebe solicitações duplicadas para a mesma vaga sem confirmação explícita.
- O produto mostra um alerta quando o administrador prepara muitas mensagens em sequência.

## 9. Modelo de dados

### Acesso e fontes

- `administrators`: identidade, organização, nome, e-mail e status.
- `admin_sessions`: sessão individual; substitui o login global sem identidade.
- `source_connections`: owner type, owner id, source type, status e timestamps.
- `network_contacts`: owner type, owner id, perfil normalizado e proveniência.
- `contact_phones`: contato, telefone E.164, fonte, verificação e `do_not_contact`.

### Vagas e matching

- `jobs`: inclui o novo ciclo de vida.
- `job_profiles`: núcleo estruturado, versão e critérios.
- `match_runs`: vaga, owner, algoritmo, estado e timestamps.
- `network_recommendations`: vaga, contato, owner da fonte, tipo (`candidate_fit` ou `connector_fit`), scores, evidências e confiança.

### WhatsApp

- `outreach_requests`: vaga, recomendação, destinatário, tipo de abordagem, mensagem, status, criado por e timestamps.
- `outreach_events`: evento append-only (`prepared`, `opened`, `manually_confirmed_sent`, `replied`, `referred`, `no_response`, `cancelled`).
- `message_templates`: organização, finalidade, corpo versionado e status.

Contatos brutos continuam isolados por owner. Uma tela administrativa acessa somente recomendações materializadas e autorizadas pelo domínio.

## 10. APIs

- `POST /api/admin/sources/linkedin`
- `POST /api/admin/sources/google-contacts`
- `GET /api/admin/network/coverage`
- `POST /api/admin/jobs`
- `PATCH /api/admin/jobs/:id`
- `PATCH /api/admin/jobs/:id/status`
- `GET /api/admin/jobs/:id/recommendations`
- `POST /api/admin/jobs/:id/recommendations/run`
- `POST /api/admin/jobs/:id/outreach`
- `PATCH /api/admin/outreach/:id/message`
- `POST /api/admin/outreach/:id/open`
- `PATCH /api/admin/outreach/:id/status`

Schemas Zod validam IDs, estados, telefones, mensagens e transições. Toda rota exige sessão administrativa individual e limita a consulta pela organização.

## 11. Tratamento de erros

- Fonte inválida: preserva o último snapshot válido e informa como corrigir.
- Telefone ausente ou inválido: recomendação permanece visível, mas o CTA de WhatsApp pede correção.
- Matching parcial: resultados disponíveis aparecem com cobertura e confiança.
- IA indisponível: usa mensagem determinística e scoring atual como fallback.
- WhatsApp não instalado: o link abre o WhatsApp Web no navegador.
- Popup bloqueado: a fila abre uma conversa por ação; nunca dispara várias abas silenciosamente.
- Contato duplicado entre redes administrativas: resolução de identidade preserva os owners e escolhe o relacionamento mais forte para a abordagem.

## 12. Privacidade e segurança

- Nenhum administrador vê credenciais, arquivos brutos ou listas completas importadas por outro administrador.
- Recomendações registram evidências mínimas e a origem administrativa sem expor toda a rede.
- Telefones são dados pessoais, têm finalidade explícita, trilha de uso e opção de bloqueio.
- Mensagens e eventos são auditáveis por organização.
- Tokens, cookies ou senhas de LinkedIn não entram na plataforma.
- O sistema não automatiza WhatsApp Web por DOM, não simula cliques em `Enviar` e não contorna controles da Meta.
- Uma futura integração Cloud API será implementada atrás de `WhatsAppGateway`, com opt-in, templates aprovados, webhooks e status reais.

## 13. Alternativas consideradas

### A. Apenas copiar a mensagem

É simples, mas adiciona fricção e erro operacional. Rejeitada porque o usuário aprovou abertura direta da conversa com texto preenchido.

### B. Click-to-chat com revisão humana — escolhida

Funciona com WhatsApp Desktop e Web, não exige credenciais Meta e mantém o administrador no controle do envio. O sistema registra preparação e abertura, sem inventar confirmações de entrega.

### C. Disparo automático pela Cloud API

Oferece entrega e webhooks reais, mas exige WhatsApp Business Platform, número empresarial, templates, opt-in e credenciais. Fica preparada como evolução pelo adaptador `WhatsAppGateway`, não como dependência da primeira entrega.

## 14. Estratégia de testes

### Unidade

- Transições válidas e inválidas das vagas.
- Normalização E.164.
- Separação entre `candidate_fit` e `connector_fit`.
- Deduplicação por vaga, contato e finalidade.
- Renderização e codificação segura das mensagens.

### Integração

- Migração idempotente em banco existente.
- Isolamento entre owners e organizações.
- Criação de vaga, núcleo, recomendações e fila.
- Registro de `opened` sem converter automaticamente para `sent`.
- Fallback quando IA ou uma fonte falha.

### E2E

- Administrador conecta rede, abre vaga e recebe os dois grupos de recomendações.
- Seleciona um indicador, edita a mensagem e abre a URL correta do WhatsApp.
- Confirma manualmente o resultado ao retornar.
- Usuário convidado continua vendo apenas sugestões da própria rede.
- Fluxos funcionam em 320 px, 390 px, tablet e desktop.

## 15. Fora de escopo

- Disparo automático sem WhatsApp Business Platform.
- Automação de cliques ou leitura de conversas no WhatsApp Web.
- Navegação irrestrita pela rede bruta de outro administrador.
- Inferência de conexões de segundo grau apresentada como fato.
- ATS completo para agenda de entrevistas, avaliação ou proposta salarial.
- Aplicativo móvel nativo.

## 16. Definition of Done

- Cada administrador possui identidade e fontes próprias.
- A organização consolida cobertura sem expor redes completas.
- A vaga percorre todas as fases definidas.
- Vagas abertas geram potenciais candidatos e potenciais indicadores sobre redes administrativas.
- Usuários continuam recebendo matches apenas da própria rede LinkedIn + Google.
- O administrador pode cadastrar/corrigir telefones, preparar mensagens e escolher destinatários.
- `Abrir no WhatsApp` abre a conversa correta com texto preenchido, sem copiar e colar.
- Estados operacionais distinguem mensagem preparada, conversa aberta e envio confirmado manualmente.
- Privacidade, deduplicação, fallback e transições possuem testes.
- Interface completa é mobile first e acessível por teclado.

