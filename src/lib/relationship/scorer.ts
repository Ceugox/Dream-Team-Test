import type { RelationshipData } from "../domain/person";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeCount(count: number, saturationPoint: number): number {
  return clamp01(count / saturationPoint);
}

function normalizeRecency(lastInteraction: string | null, now: Date): number {
  if (!lastInteraction) return 0;
  const days = (now.getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return 1;
  // Full score at 0 days, decays to 0 by 365 days.
  return clamp01(1 - days / 365);
}

export function computeRelationshipScore(data: RelationshipData | null, now: Date = new Date()): number {
  if (!data) return 0;

  const frequency = data.frequency ?? normalizeCount(data.emailsSent + data.emailsReceived, 30);
  const recency = data.recency ?? normalizeRecency(data.lastInteraction, now);
  const meetings = normalizeCount(data.meetings, 10);
  const totalEmails = data.emailsSent + data.emailsReceived;
  const reciprocity =
    data.reciprocity ?? (totalEmails > 0 ? clamp01(1 - Math.abs(data.emailsSent - data.emailsReceived) / totalEmails) : 0);
  const contactSignal = data.contactSignal ?? 0;

  const score = 0.3 * frequency + 0.3 * recency + 0.2 * meetings + 0.15 * reciprocity + 0.05 * contactSignal;
  return clamp01(score);
}
