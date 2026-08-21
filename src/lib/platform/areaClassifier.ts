export type AreaCode =
  | "eng_software" | "dados_ia" | "produto" | "design" | "growth_mkt" | "vendas"
  | "financas" | "talent_rh" | "consultoria" | "juridico" | "operacoes" | "academia";

export type AreaInference = { area: AreaCode | null; label: string | null; confidence: number; matched: string[]; ruleVersion: string };

// Classificação heurística e explicável da área de atuação a partir da headline.
// Determinística (stdlib), sem LLM — irmã de inferNetworkCapital. É um sinal, nunca
// uma decisão automática de contratação.
export const AREA_RULE_VERSION = "2026-08-21.1";

type Bucket = { tag: string; pattern: RegExp };
type AreaRule = { area: AreaCode; label: string; priority: number; buckets: Bucket[] };

// priority: menor vence empate de score. Domínios técnicos antes; academia é fallback.
const AREA_RULES: AreaRule[] = [
  { area: "dados_ia", label: "Dados & IA/ML", priority: 1, buckets: [
    { tag: "data-science", pattern: /\b(data scien(?:ce|tist)|cientista de dados|ci[eê]ncia de dados|data analyst|analista de dados)\b/i },
    { tag: "ml-ai", pattern: /\b(machine learning|\bml\b|mlops|deep learning|\bnlp\b|intelig[eê]ncia artificial|artificial intelligence|generative ai|\bai\b|\bia\b)\b/i },
    { tag: "data-eng", pattern: /\b(data engineer|engenheir[oa] de dados|engenharia de dados|\betl\b|\belt\b|data pipeline|spark|airflow|\bdbt\b)\b/i },
    { tag: "analytics-bi", pattern: /\b(analytics|business intelligence|\bbi\b|power bi|tableau|looker|estat[ií]stic\w*)\b/i },
    { tag: "data-stack", pattern: /\b(pandas|tensorflow|pytorch|scikit|aws athena|bigquery|snowflake|databricks)\b/i },
  ] },
  { area: "eng_software", label: "Engenharia de Software", priority: 2, buckets: [
    { tag: "software-eng", pattern: /\b(software engineer|engenheir[oa] de software|engenharia de software|desenvolvedor[a]?|developer|programador[a]?)\b/i },
    { tag: "web-stack", pattern: /\b(full[\s-]?stack|back[\s-]?end|front[\s-]?end|web developer)\b/i },
    { tag: "infra", pattern: /\b(devops|\bsre\b|site reliability|platform engineer|cloud engineer|infrastructure)\b/i },
    { tag: "mobile", pattern: /\b(mobile (?:developer|engineer)|android|ios developer|flutter)\b/i },
    { tag: "eng-stack", pattern: /\b(react|node\.?js|typescript|golang|\bjava\b|kotlin|\.net|c#|spring boot|rails|angular|vue)\b/i },
    { tag: "eng-lead", pattern: /\b(tech lead|staff engineer|principal engineer|engineering manager|l[ií]der t[eé]cnic[oa])\b/i },
  ] },
  { area: "design", label: "Design", priority: 3, buckets: [
    { tag: "design", pattern: /\b(\bux\b|\bui\b|ux\/ui|product design(?:er)?|designer|design de produto|user experience|experi[eê]ncia do usu[aá]rio|motion design|brand design)\b/i },
  ] },
  { area: "financas", label: "Finanças & Investimentos", priority: 3, buckets: [
    { tag: "finance", pattern: /\b(finan[cç]\w*|venture capital|\bvc\b|private equity|investment\w*|investimento\w*|\bm&a\b|equity research|fp&a|controller|controladoria|cont[aá]bil|contabilidade|banco de investimento|\bcfo\b|wealth|asset management|hedge fund|atu[aá]ri\w*)\b/i },
  ] },
  { area: "juridico", label: "Jurídico", priority: 3, buckets: [
    { tag: "legal", pattern: /\b(legal|jur[ií]dic\w*|advogad[oa]|lawyer|attorney|direito|\bllb\b|compliance|paralegal)\b/i },
  ] },
  { area: "produto", label: "Produto", priority: 3, buckets: [
    { tag: "pm", pattern: /\b(product manager|gerente de produto|product owner|head of product|product lead|associate product manager|product ops|gest[aã]o de produto)\b/i },
  ] },
  { area: "vendas", label: "Vendas & GTM", priority: 4, buckets: [
    { tag: "sales", pattern: /\b(sales|account executive|account manager|business development|\bbdr\b|\bsdr\b|pre[\s-]?sales|vendas|comercial|executiv[oa] de contas|desenvolvimento de neg[oó]cios|gerente comercial|revenue|go[\s-]?to[\s-]?market|\bgtm\b)\b/i },
  ] },
  { area: "talent_rh", label: "RH & Talent", priority: 4, buckets: [
    { tag: "talent", pattern: /\b(recruit\w*|recrut\w*|\btalents?\b|talent acquisition|tech recruiter|\brh\b|human resources|recursos humanos|\bhrbp\b|people ops|people partner|aquisi[cç][aã]o de talentos|gente e gest[aã]o|headhunter)\b/i },
  ] },
  { area: "consultoria", label: "Consultoria & Estratégia", priority: 4, buckets: [
    { tag: "consulting", pattern: /\b(consult\w*|strateg\w*|estrat[eé]gi\w*|advisory|corporate development|desenvolvimento corporativo)\b/i },
  ] },
  { area: "growth_mkt", label: "Growth & Marketing", priority: 5, buckets: [
    { tag: "marketing", pattern: /\b(marketing|growth|m[ií]dia paga|paid media|\bseo\b|content|conte[uú]do|social media|branding|demand gen|inbound|performance marketing|comunica[cç][aã]o)\b/i },
  ] },
  { area: "operacoes", label: "Operações", priority: 6, buckets: [
    { tag: "ops", pattern: /\b(operations|opera[cç][oõ]es|supply chain|log[ií]stica|\bcoo\b|customer success|customer experience|\bcx\b|gest[aã]o de opera[cç][oõ]es|project manager|gerente de projetos|\bpmo\b)\b/i },
  ] },
  { area: "academia", label: "Academia & Pesquisa", priority: 9, buckets: [
    { tag: "academic", pattern: /\b(student|estudante|estagi[aá]ri[oa]|intern|bolsista|pesquisador[a]?|research(?:er)?|professor[a]?|docente|mestrad[oa]|doutorad[oa]|\bphd\b|\bmba\b|gradua[cç][aã]o|universit[aá]ri[oa]|bacharelad\w*)\b/i },
  ] },
];

export function inferArea(input: { headline: string | null; profileContext: string | null }): AreaInference {
  const text = [input.headline, input.profileContext].filter(Boolean).join(" · ");
  if (!text.trim()) return { area: null, label: null, confidence: 0, matched: [], ruleVersion: AREA_RULE_VERSION };
  let best: { rule: AreaRule; score: number; tags: string[] } | null = null;
  for (const rule of AREA_RULES) {
    const tags = rule.buckets.filter(bucket => bucket.pattern.test(text)).map(bucket => bucket.tag);
    if (!tags.length) continue;
    const score = tags.length;
    if (!best || score > best.score || (score === best.score && rule.priority < best.rule.priority)) {
      best = { rule, score, tags };
    }
  }
  if (!best) return { area: null, label: null, confidence: 0, matched: [], ruleVersion: AREA_RULE_VERSION };
  const confidence = Math.min(0.95, 0.5 + best.score * 0.15 + (input.profileContext?.trim() ? 0.05 : 0));
  return { area: best.rule.area, label: best.rule.label, confidence, matched: best.tags, ruleVersion: AREA_RULE_VERSION };
}
