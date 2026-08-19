import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import type { CandidateFitResult } from "./candidateFit";

export function computeReferralScore(candidateFit: number, relationshipScore: number, confidence: number): number {
  return candidateFit * (0.7 + 0.3 * relationshipScore) * confidence;
}

export function explainMatch(person: Person, job: JobProfile, fit: CandidateFitResult): string[] {
  const evidence: string[] = [];

  if (fit.skillsFit > 0) {
    const matched = [...job.requiredSkills, ...job.preferredSkills].filter((skill) =>
      (person.skills.join(" ") + " " + (person.headline ?? "")).toLowerCase().includes(skill.toLowerCase())
    );
    if (matched.length > 0) evidence.push(`Skills matched: ${matched.join(", ")}`);
  }

  if (fit.industryFit === 1 && job.industry) {
    evidence.push(`${job.industry[0].toUpperCase()}${job.industry.slice(1)} experience`);
  }

  if (fit.locationFit === 1 && job.location) {
    evidence.push(`Based in ${job.location}`);
  }

  if (fit.seniorityFit === 1 && job.seniority !== "unknown") {
    evidence.push(`Seniority matches: ${job.seniority}`);
  }

  const relationship = person.relationship;
  if (relationship) {
    const totalInteractions = relationship.emailsSent + relationship.emailsReceived + relationship.meetings;
    if (totalInteractions > 0) {
      evidence.push(`${totalInteractions} interactions with you`);
    }
    if (relationship.meetings > 0) {
      evidence.push(`${relationship.meetings} meetings together`);
    }
    if (relationship.lastInteraction) {
      evidence.push(`Last interaction: ${relationship.lastInteraction.slice(0, 10)}`);
    }
  }

  return evidence;
}
