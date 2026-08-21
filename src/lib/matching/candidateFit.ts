import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import { parseHeadline } from "../enrichment/headline";
import { containsSkillToken, meaningfulTitleTerms } from "./vocabulary";

export interface CandidateFitResult {
  score: number;
  skillsFit: number;
  roleFit: number;
  seniorityFit: number;
  industryFit: number;
  locationFit: number;
  areaFit: number;
  /** Fração do peso total que tinha evidência dos dois lados. Baixo = score pouco confiável. */
  evidenceCoverage: number;
  measured: string[];
}

/** Alinhamento de área vindo de fora: o classificador vive na camada de plataforma. */
export type CandidateFitContext = { sameArea?: boolean | null };

const WEIGHTS = { skills: 0.35, area: 0.3, role: 0.25, seniority: 0.15, industry: 0.15, location: 0.1 };
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
// Senioridade igual, sozinha, não faz de alguém candidato: exige-se pelo menos um sinal de substância.
const SUBSTANTIVE = ["skills", "role", "area"];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function textOverlapFit(candidateText: string, targetTerms: string[]): number {
  const lower = candidateText.toLowerCase();
  const hits = targetTerms.filter(term => lower.includes(term.toLowerCase()));
  return clamp01(hits.length / targetTerms.length);
}

export function computeCandidateFit(person: Person, job: JobProfile, context: CandidateFitContext = {}): CandidateFitResult {
  const parsed = parseHeadline(person.headline);
  const skillTerms = [...job.requiredSkills, ...job.preferredSkills];
  const skillsText = `${person.skills.join(" ")} ${person.headline ?? ""}`.trim();
  const requiredHits = job.requiredSkills.filter(skill => containsSkillToken(skillsText, skill));
  const preferredHits = job.preferredSkills.filter(skill => containsSkillToken(skillsText, skill));
  const skillsFit = skillTerms.length === 0 ? 0
    : clamp01((requiredHits.length + preferredHits.length * 0.5) / (job.requiredSkills.length || 1));

  const roleText = person.currentRole ?? parsed.role ?? "";
  const titleTerms = meaningfulTitleTerms(job.title);
  const roleFit = roleText && titleTerms.length ? textOverlapFit(roleText, titleTerms) : 0;

  const seniorityKnown = job.seniority !== "unknown" && parsed.seniority !== "unknown";
  const seniorityFit = seniorityKnown && parsed.seniority === job.seniority ? 1 : 0;

  // Setor só conta quando os dois lados falam de setor; senão a vaga puniria a rede inteira
  // por igual e o limiar esvaziaria a lista.
  const industryKnown = Boolean(job.industry) && parsed.industryKeywords.length > 0;
  const industryFit = industryKnown && parsed.industryKeywords.includes(job.industry!.toLowerCase()) ? 1 : 0;

  // O conector do LinkedIn coleta nome e headline, nunca localização: na prática esta dimensão
  // fica de fora em vez de zerar o score de todo mundo numa vaga com cidade preenchida.
  const locationKnown = Boolean(job.location) && Boolean(person.location);
  const locationFit = locationKnown && person.location!.toLowerCase().includes(job.location!.toLowerCase()) ? 1 : 0;

  const areaKnown = context.sameArea === true || context.sameArea === false;
  const areaFit = context.sameArea === true ? 1 : 0;

  const dimensions: Array<{ name: keyof typeof WEIGHTS; value: number; known: boolean }> = [
    { name: "skills", value: skillsFit, known: skillTerms.length > 0 && skillsText.length > 0 },
    { name: "area", value: areaFit, known: areaKnown },
    { name: "role", value: roleFit, known: Boolean(roleText) && titleTerms.length > 0 },
    { name: "seniority", value: seniorityFit, known: seniorityKnown },
    { name: "industry", value: industryFit, known: industryKnown },
    { name: "location", value: locationFit, known: locationKnown },
  ];

  const known = dimensions.filter(dimension => dimension.known);
  const measured = known.map(dimension => dimension.name);
  const knownWeight = known.reduce((sum, dimension) => sum + WEIGHTS[dimension.name], 0);
  const hasSubstance = measured.some(name => SUBSTANTIVE.includes(name));
  const score = !knownWeight || !hasSubstance ? 0
    : clamp01(known.reduce((sum, dimension) => sum + WEIGHTS[dimension.name] * dimension.value, 0) / knownWeight);

  return {
    score,
    skillsFit, roleFit, seniorityFit, industryFit, locationFit, areaFit,
    evidenceCoverage: knownWeight / TOTAL_WEIGHT,
    measured,
  };
}
