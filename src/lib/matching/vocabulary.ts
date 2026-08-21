// Vocabulário compartilhado entre o parser de vaga e o de headline. Antes cada arquivo tinha
// a sua listinha em inglês, o que deixava a dimensão de skills morta na maioria das vagas reais
// (a rede é generalista e os textos são em PT-BR).

export type Seniority = "junior" | "pleno" | "senior" | "staff" | "unknown";

// Acento é obrigatório aqui: /\bsenior\b/ NÃO casa "Sênior", e era por isso que vaga e headline
// em português caíam em "unknown" — dando pontuação de graça no fit por dimensão desconhecida.
export const SENIORITY_PATTERNS: Array<[RegExp, Exclude<Seniority, "unknown">]> = [
  [/\b(staff|principal|distinguished|head of|head de|diretor[ae]?|director|vp|c[toe]o)\b/i, "staff"],
  [/\b(s[êe]nior|sr\.?|especialista|expert)\b/i, "senior"],
  [/\b(pleno|mid[- ]level|intermedi[áa]rio)\b/i, "pleno"],
  [/\b(j[úu]nior|jr\.?|intern|estagi[áa]ri[oa]|trainee|assistente|aprendiz)\b/i, "junior"],
];

export function detectSeniority(text: string | null | undefined): Seniority {
  if (!text) return "unknown";
  for (const [pattern, level] of SENIORITY_PATTERNS) if (pattern.test(text)) return level;
  return "unknown";
}

// Termos de setor, em PT-BR e inglês. Casam por substring (setor aparece colado com frequência:
// "agronegócio", "e-commerce B2B").
export const INDUSTRY_KEYWORDS = [
  "fintech", "healthtech", "edtech", "insurtech", "proptech", "agtech", "hrtech", "legaltech",
  "e-commerce", "ecommerce", "marketplace", "saas", "varejo", "retail",
  "logistics", "logística", "logistica", "supply chain",
  "payments", "pagamentos", "banking", "bancário", "bancario", "seguros", "insurance",
  "educação", "educacao", "education", "saúde", "saude", "health",
  "imobiliário", "imobiliario", "real estate", "construção", "construcao",
  // "agronegócio" antes de "agro": a busca é por substring e o termo específico tem de vencer.
  "agronegócio", "agronegocio", "agro", "energia", "energy", "óleo e gás", "oleo e gas",
  "telecom", "mídia", "midia", "media", "publicidade", "consultoria", "consulting",
  "indústria", "industria", "manufacturing", "automotivo", "turismo", "games",
] as const;

// A ordem da lista é a prioridade: um texto pode citar vários setores ("time de Payments" numa
// vaga de "Fintech") e o primeiro declarado ganha. Ordenar por tamanho mudaria essa escolha.
export function detectIndustry(text: string): string | null {
  const lower = text.toLowerCase();
  return INDUSTRY_KEYWORDS.find(keyword => lower.includes(keyword)) ?? null;
}

// Palavras de nível e de hierarquia não distinguem cargo: "Analista" casa com Analista
// Financeiro, de Marketing e de Suporte igualmente. Senioridade já tem dimensão própria.
export const GENERIC_TITLE_TERMS = new Set([
  "senior", "sênior", "junior", "júnior", "pleno", "staff", "principal", "trainee",
  "analista", "assistente", "auxiliar", "estagiario", "estagiário", "especialista",
  "coordenador", "coordenadora", "gerente", "manager", "diretor", "diretora", "director",
  "head", "lead", "líder", "lider", "supervisor", "executivo", "executiva", "consultor",
  "consultora", "profissional", "pessoa", "vaga", "banco", "empresa",
]);

/** Termos do título que realmente identificam a função, sem o ruído de nível/hierarquia. */
export function meaningfulTitleTerms(title: string): string[] {
  return title
    .split(/\s+/)
    .map(term => term.replace(/[(),.;:]/g, ""))
    .filter(term => term.length > 3 && !GENERIC_TITLE_TERMS.has(term.toLowerCase()));
}

// Skills casam por limite de palavra (\b), então entradas com caractere não-alfanumérico nas
// pontas (".net", "c++") nunca casariam — ficam de fora em vez de virar entrada morta.
export const KNOWN_SKILLS = [
  // Engenharia
  "python", "kotlin", "java", "javascript", "typescript", "go", "golang", "rust", "scala", "ruby",
  "php", "swift", "elixir", "node", "nodejs", "node.js", "react", "react native", "angular", "vue",
  "svelte", "next.js", "nestjs", "express", "django", "flask", "fastapi", "rails", "spring",
  "laravel", "flutter", "graphql", "grpc", "tailwind",
  "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins",
  "github actions", "ci/cd", "linux", "microservices", "microsserviços", "distributed systems",
  "kafka", "rabbitmq", "redis", "postgres", "postgresql", "mysql", "mongodb", "elasticsearch",
  "sql", "nosql",
  // Dados e IA
  "spark", "hadoop", "airflow", "dbt", "snowflake", "databricks", "bigquery", "pandas", "numpy",
  "pytorch", "tensorflow", "scikit-learn", "machine learning", "deep learning", "nlp", "llm",
  "data science", "etl", "power bi", "tableau", "looker", "qlik", "google analytics", "excel", "vba",
  // Produto e design
  "figma", "sketch", "adobe xd", "design system", "ux", "ui", "user research", "wireframe",
  "prototipação", "prototipacao", "jira", "scrum", "kanban", "agile", "ágil", "roadmap", "okr",
  "discovery", "a/b test", "analytics",
  // Growth, marketing e vendas
  "seo", "google ads", "meta ads", "facebook ads", "linkedin ads", "inbound", "outbound",
  "hubspot", "salesforce", "crm", "copywriting", "branding", "growth", "performance",
  "email marketing", "social media", "pipeline", "prospecção", "prospeccao", "negociação",
  "negociacao",
  // Finanças, RH e jurídico
  "fp&a", "valuation", "controladoria", "contabilidade", "ifrs", "sap", "orçamento", "orcamento",
  "auditoria", "tesouraria", "recrutamento", "recruiting", "recruitment", "people analytics",
  "employer branding", "folha de pagamento", "onboarding", "lgpd", "compliance", "contratos",
  "societário", "societario", "due diligence",
] as const;

export function containsSkillToken(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function extractSkills(text: string): string[] {
  return KNOWN_SKILLS.filter(skill => containsSkillToken(text, skill));
}
