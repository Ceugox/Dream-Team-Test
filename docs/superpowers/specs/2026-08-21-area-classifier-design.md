# Classificador de Área (por stack/cargo da headline) — Design

**Data:** 2026-08-21

## Objetivo
Inferir a **área de atuação** de um contato a partir da headline (+ profileContext),
de forma heurística, determinística e explicável — irmão do `inferNetworkCapital`.
A área vira (1) badge no card da rede e (2) sinal no `scoreConnectorFit` (boost quando
casa com a área da vaga).

## Decisões (aprovadas)
- **Escopo:** badge no card + boost no score de conector.
- **Persistência:** on-the-fly (sem migração; retroativo a todos sem re-sync).
- **Abordagem:** heurística stdlib (regex PT/EN), sem LLM.
- **Taxonomia (12):** Engenharia de Software, Dados & IA/ML, Produto, Design,
  Growth & Marketing, Vendas & GTM, Finanças & Investimentos, RH & Talent,
  Consultoria & Estratégia, Jurídico, Operações, Academia & Pesquisa.

## Interface
`src/lib/platform/areaClassifier.ts`
```ts
type AreaCode = "eng_software"|"dados_ia"|"produto"|"design"|"growth_mkt"|"vendas"
  |"financas"|"talent_rh"|"consultoria"|"juridico"|"operacoes"|"academia";
type AreaInference = { area: AreaCode|null; label: string|null; confidence: number; matched: string[]; ruleVersion: string };
function inferArea(input: { headline: string|null; profileContext: string|null }): AreaInference;
```

## Algoritmo
- Cada área tem `buckets` (regex de conceitos distintos) e uma `priority` (menor vence empate).
- `score` da área = nº de buckets que casam. Vence maior score; empate → menor priority.
- `academia` tem priority alta (fallback): "estagiário/intern/MBA" não sobrepõe a área
  de stack quando há sinal técnico (ex.: "Estágio em Data Science" → Dados & IA, não Academia).
- Tokens genéricos (python/sql) **não** contam como bucket de Dados, para não puxar
  devs backend; o bucket de dados usa só ferramentas específicas (pandas, spark, athena…).
- `confidence = min(0.95, 0.5 + score*0.15 + (temProfileContext ? 0.05 : 0))`.

## Integração
- **Card (`admin/rede/page.tsx`):** `inferArea({headline, profileContext})` por contato;
  badge com o `label` ao lado do SourceBadge quando `area != null`.
- **`scoreConnectorFit`:** inferir área do contato e da vaga (title + description + skills);
  se ambas != null e iguais → `+0.18` e evidência "Mesma área da vaga (<label>)".

## Fora de escopo
- Coluna no banco / filtro server-side (fica para v2 se necessário).
- Refino por LLM.

## Verificação
- `areaClassifier.test.ts` com contatos reais da rede (Dados, Eng, Finanças, Vendas,
  Consultoria) cobrindo os empates críticos.
- Suíte completa + `tsc` verdes; deploy e HTTP 200.
