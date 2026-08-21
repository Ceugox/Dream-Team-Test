# Design — Captura de headline na fonte (extensão LinkedIn)

**Data:** 2026-08-20
**Status:** aprovado para planejamento

## Problema

O conector por extensão coleta as conexões do LinkedIn na página de lista, mas hoje
extrai apenas nome + URL. A headline (cargo @ empresa) sai vazia porque o scraper
delimita o card com `anchor.closest("li")`, e os cards atuais do LinkedIn não são
`<li>` — são `<div>` com classes ofuscadas (hash que muda a cada build). Sem headline,
os contatos ficam com "contexto incompleto": o `inferNetworkCapital` não tem texto para
pontuar e o matching de vagas perde sinal.

## Escopo

**Dentro:** capturar **nome + headline** de cada card na página de conexões.
**Fora (YAGNI):** localização (não aparece na lista), visitar perfis individuais
(histórico/formação completos), qualquer mudança no motor de enriquecimento LLM ou no
schema. Localização e histórico exigiriam navegar cada perfil — descartado por
tempo/risco de rate limit.

## Estrutura observada do card (DOM real, 2026-08-20)

Classes são ofuscadas e inúteis como seletor. O **texto** de cada card é estável:

```
<Nome>
<Headline>
Conexão feita em <data>
Mensagem
```

Headlines reais capturadas: "Venture Capital @ MAYA Capital", "MBA pela HEC Paris | …",
"Instituto Tecnológico de Aeronáutica", "Sales & Marketing Executive | …". São
exatamente os sinais que `inferNetworkCapital` reconhece (Tier A/B, formação
internacional, mercado financeiro, consultoria).

## Abordagem: delimitação por âncora de texto

Escolhida por ser a única resiliente à ofuscação de classes; validada contra o DOM real.

### Extração (`browser-extension/linkedin-scraper.js`)

Substituir a delimitação `closest("li")` por:

1. A partir do link `/in/`, subir os ancestrais (teto de 8 níveis) até o nó cujo texto
   contém o **marcador de rodapé do card**: `/(conex[ãa]o feita em|connected|conectad)/i`.
   Esse nó é o card.
2. `innerText` do card → linhas limpas (trim, sem vazias).
3. **Nome** = texto do próprio `<a>` (mais confiável que adivinhar por linha).
4. **Headline** = `pickHeadline(lines, name)` — primeira linha após o nome e antes do
   marcador de rodapé que não seja o marcador, "Mensagem"/"Message" nem igual ao nome.
5. Sem headline encontrada → `null` (não inventar).

Suporta PT e EN. O objeto enviado continua `{ name, headline, profileUrl, linkedinUrl }`
— **sem mudança de contrato**.

### Função pura testável

```js
// pickHeadline(lines: string[], name: string): string | null
// lines: innerText do card já limpo; name: texto do anchor.
// Retorna a headline ou null. Sem dependência de DOM.
```

Marcadores de rodapé/ruído tratados como constantes: `CONNECTION_MARKERS`
(`conexão feita em`, `conexao feita em`, `connected`, `conectad`) e `ACTION_LABELS`
(`mensagem`, `message`, `seguir`, `follow`).

## Backend (sem mudança de contrato)

- A rota admin `browser-sync` (`src/app/api/admin/network/route.ts`) já chama
  `parseAdminNetworkFile`, que lê `headline` e roda `inferNetworkCapital`. Com a headline
  preenchida, os sinais passam a ser capturados — custo zero de LLM.
- Ajuste pequeno: montar `profileContext` a partir da headline quando existir, em vez do
  placeholder "Conexão visível no LinkedIn", para o motor e o matching não perderem o sinal.
- Membro (`/api/member/linkedin`) já persiste `headline` via `upsertNetworkContacts`.
- Sem schema, sem migração, sem mudança na fila. O enriquecimento LLM opcional
  (`discoverPublicProfile`) segue disponível por cima, agora com melhor desambiguação.

## Testes e verificação

1. **Unitário (vitest):** `pickHeadline` — card normal, sem headline (→ null), marcadores
   PT e EN, e nome com sufixo "Gabriel Mendes de Freitas, LLB, MBA" (não confundir sufixo
   com headline).
2. **DOM real (antes de finalizar):** snippet de console roda a extração sobre a página de
   conexões e reporta "X de Y cards com headline"; portar só com cobertura alta.
3. **Ponta a ponta:** rodar o fluxo pela extensão e confirmar no painel que os contatos têm
   contexto real (não "incompleto") e que sinais como ITA/HEC/MAYA são reconhecidos.
4. `node --check` na extensão a cada edição; suíte do app verde.

## Definition of Done

- [ ] `pickHeadline` extraído como função pura com testes vitest passando.
- [ ] Scraper delimita o card por marcador de rodapé e preenche `headline`.
- [ ] Cobertura de headline verificada no DOM real (~100% dos cards com headline).
- [ ] `profileContext` do admin usa a headline quando presente.
- [ ] Fluxo ponta a ponta: contatos deixam de aparecer como "contexto incompleto".
- [ ] Sem mudança de schema/contrato; suíte e `node --check` verdes.
