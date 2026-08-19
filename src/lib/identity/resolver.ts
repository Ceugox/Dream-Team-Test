import type { Person, RelationshipData } from "../domain/person";

function normalizeLinkedinUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

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

  if (a.linkedinUrl && b.linkedinUrl && normalizeLinkedinUrl(a.linkedinUrl) === normalizeLinkedinUrl(b.linkedinUrl)) {
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

function earlierIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function mergeRelationship(a: RelationshipData | null, b: RelationshipData | null): RelationshipData | null {
  if (!a) return b;
  if (!b) return a;
  return {
    emailsSent: a.emailsSent + b.emailsSent,
    emailsReceived: a.emailsReceived + b.emailsReceived,
    meetings: a.meetings + b.meetings,
    firstInteraction: earlierIso(a.firstInteraction, b.firstInteraction),
    lastInteraction: laterIso(a.lastInteraction, b.lastInteraction),
    reciprocity: a.reciprocity ?? b.reciprocity,
    frequency: a.frequency ?? b.frequency,
    recency: a.recency ?? b.recency,
    contactSignal: a.contactSignal ?? b.contactSignal,
  };
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
    relationship: mergeRelationship(survivor.relationship, mergedIn.relationship),
  };
}
