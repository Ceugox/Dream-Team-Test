import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import { parseHeadline } from "../enrichment/headline";

export interface CandidateFitResult {
  score: number;
  skillsFit: number;
  roleFit: number;
  seniorityFit: number;
  industryFit: number;
  locationFit: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function containsSkillToken(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function textOverlapFit(candidateText: string | null, targetTerms: string[]): number {
  if (!candidateText || targetTerms.length === 0) return 0;
  const lower = candidateText.toLowerCase();
  const hits = targetTerms.filter((term) => lower.includes(term.toLowerCase()));
  return clamp01(hits.length / targetTerms.length);
}

export function computeCandidateFit(person: Person, job: JobProfile): CandidateFitResult {
  const parsed = parseHeadline(person.headline);
  const allSkillTerms = [...job.requiredSkills, ...job.preferredSkills];
  const skillsText = person.skills.join(" ") + " " + (person.headline ?? "");
  const requiredHits = job.requiredSkills.filter((s) => containsSkillToken(skillsText, s));
  const preferredHits = job.preferredSkills.filter((s) => containsSkillToken(skillsText, s));
  const skillsFit =
    allSkillTerms.length === 0
      ? 0
      : clamp01((requiredHits.length * 1 + preferredHits.length * 0.5) / (job.requiredSkills.length || 1));

  const roleText = person.currentRole ?? parsed.role ?? "";
  const roleFit = textOverlapFit(roleText, job.title.split(/\s+/).filter((w) => w.length > 3));

  const personSeniority = parsed.seniority;
  const seniorityFit = job.seniority === "unknown" ? 0.5 : personSeniority === job.seniority ? 1 : personSeniority === "unknown" ? 0.3 : 0.1;

  const industryFit = job.industry
    ? parsed.industryKeywords.includes(job.industry.toLowerCase()) || (person.headline ?? "").toLowerCase().includes(job.industry.toLowerCase())
      ? 1
      : 0
    : 0.5;

  const locationFit = job.location
    ? person.location && person.location.toLowerCase().includes(job.location.toLowerCase())
      ? 1
      : 0
    : 0.5;

  const score = 0.35 * skillsFit + 0.25 * roleFit + 0.15 * seniorityFit + 0.15 * industryFit + 0.1 * locationFit;

  return { score: clamp01(score), skillsFit, roleFit, seniorityFit, industryFit, locationFit };
}
