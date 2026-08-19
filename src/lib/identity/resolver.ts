import type { Person } from "../domain/person";

export interface MergeDecision {
  shouldMerge: boolean;
  matchScore: number;
  signalsUsed: string[];
  mergeReason: string;
}

const MERGE_THRESHOLD = 0.8;

export function resolveIdentity(a: Person, b: Person): MergeDecision {
  const signalsUsed: string[] = [];
  let matchScore = 0;

  if (a.linkedinUrl && b.linkedinUrl && a.linkedinUrl === b.linkedinUrl) {
    signalsUsed.push("linkedinUrl");
    matchScore = Math.max(matchScore, 0.99);
  }

  const sharedEmail = a.emails.find((e) => b.emails.includes(e));
  if (sharedEmail) {
    signalsUsed.push("email");
    matchScore = Math.max(matchScore, 0.98);
  }

  const sharedPhone = a.phones.find((p) => b.phones.includes(p));
  if (sharedPhone) {
    signalsUsed.push("phone");
    matchScore = Math.max(matchScore, 0.97);
  }

  const sameName = !!a.name && !!b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

  if (signalsUsed.length === 0 && sameName && a.currentCompany && a.currentCompany === b.currentCompany) {
    signalsUsed.push("name+company");
    matchScore = Math.max(matchScore, 0.7);
  }

  if (signalsUsed.length === 0 && sameName) {
    // Name alone is never sufficient — explicitly scored below the merge threshold.
    signalsUsed.push("name");
    matchScore = Math.max(matchScore, 0.3);
  }

  const shouldMerge = matchScore >= MERGE_THRESHOLD;
  const mergeReason = shouldMerge
    ? `Merged on signals: ${signalsUsed.join(", ")} (score ${matchScore.toFixed(2)})`
    : `Not merged — highest signal was ${signalsUsed[0] ?? "none"} (score ${matchScore.toFixed(2)}, below threshold ${MERGE_THRESHOLD})`;

  return { shouldMerge, matchScore, signalsUsed, mergeReason };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function mergePeople(survivor: Person, mergedIn: Person): Person {
  return {
    ...survivor,
    name: survivor.name ?? mergedIn.name,
    emails: dedupeStrings([...survivor.emails, ...mergedIn.emails]),
    phones: dedupeStrings([...survivor.phones, ...mergedIn.phones]),
    linkedinUrl: survivor.linkedinUrl ?? mergedIn.linkedinUrl,
    headline: survivor.headline ?? mergedIn.headline,
    currentCompany: survivor.currentCompany ?? mergedIn.currentCompany,
    currentRole: survivor.currentRole ?? mergedIn.currentRole,
    location: survivor.location ?? mergedIn.location,
    previousCompanies: dedupeStrings([...survivor.previousCompanies, ...mergedIn.previousCompanies]),
    education: dedupeStrings([...survivor.education, ...mergedIn.education]),
    skills: dedupeStrings([...survivor.skills, ...mergedIn.skills]),
    sources: dedupeStrings([...survivor.sources, ...mergedIn.sources]),
    relationship: survivor.relationship ?? mergedIn.relationship,
  };
}
