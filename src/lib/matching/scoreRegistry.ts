import type { Person, ConfidenceData } from "../domain/person";
import type { JobProfile } from "../domain/job";
import { computeCandidateFit } from "./candidateFit";
import { computeRelationshipScore } from "../relationship/scorer";
import { computeReferralScore, explainMatch } from "./referralScore";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function computeConfidence(person: Person): ConfidenceData {
  const fields = [
    person.name,
    person.linkedinUrl,
    person.headline,
    person.currentCompany,
    person.currentRole,
    person.location,
  ];
  const populated = fields.filter((f) => f !== null && f !== "").length;
  const identity = person.linkedinUrl || person.emails.length > 0 ? 0.95 : clamp01(populated / fields.length);
  const company = person.currentCompany ? 0.9 : null;
  const role = person.currentRole ? 0.9 : null;
  const overall = clamp01((identity + populated / fields.length) / 2);
  return { identity, company, role, overall };
}

export function rankCandidates(
  people: Person[],
  job: JobProfile,
  // O classificador de área mora na camada de plataforma; quem chama injeta o alinhamento.
  options: { sameArea?: (person: Person) => boolean | null } = {}
): Array<Person & { referralEvidence: string[] }> {
  return people
    .map((person) => {
      const fit = computeCandidateFit(person, job, { sameArea: options.sameArea?.(person) ?? null });
      const relationshipScore = computeRelationshipScore(person.relationship);
      const confidence = computeConfidence(person);
      const referralScore = computeReferralScore(fit.score, relationshipScore, confidence.overall);
      const referralEvidence = explainMatch(person, job, fit);
      return {
        ...person,
        jobFitScore: fit.score,
        relationshipScore,
        referralScore,
        confidence,
        referralEvidence,
      };
    })
    .sort((a, b) => (b.referralScore ?? 0) - (a.referralScore ?? 0));
}
