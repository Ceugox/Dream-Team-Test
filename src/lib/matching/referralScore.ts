import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import type { CandidateFitResult } from "./candidateFit";

function containsSkillToken(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function computeReferralScore(candidateFit: number, relationshipScore: number, confidence: number): number {
  return candidateFit * (0.7 + 0.3 * relationshipScore) * confidence;
}

export function explainMatch(person: Person, job: JobProfile, fit: CandidateFitResult): string[] {
  const evidence: string[] = [];

  if (fit.skillsFit > 0) {
    const skillsText = person.skills.join(" ") + " " + (person.headline ?? "");
    const matched = [...job.requiredSkills, ...job.preferredSkills].filter((skill) =>
      containsSkillToken(skillsText, skill)
    );
    if (matched.length > 0) evidence.push(`Competências em comum: ${matched.join(", ")}`);
  }

  if (fit.industryFit === 1 && job.industry) {
    evidence.push(`Experiência em ${job.industry}`);
  }

  if (fit.locationFit === 1 && job.location && person.location) {
    evidence.push(`Localização: ${person.location}`);
  }

  if (fit.seniorityFit === 1 && job.seniority !== "unknown") {
    evidence.push(`Senioridade aderente: ${job.seniority}`);
  }

  const relationship = person.relationship;
  if (relationship) {
    const totalInteractions = relationship.emailsSent + relationship.emailsReceived + relationship.meetings;
    if (totalInteractions > 0) {
      evidence.push(`${totalInteractions} interações com você`);
    }
    if (relationship.meetings > 0) {
      evidence.push(`${relationship.meetings} reuniões em comum`);
    }
    if (relationship.lastInteraction) {
      evidence.push(`Última interação: ${relationship.lastInteraction.slice(0, 10)}`);
    }
  }

  return evidence;
}
