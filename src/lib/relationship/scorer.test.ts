import { expect, test } from "vitest";
import { computeRelationshipScore } from "./scorer";

test("null relationship data scores 0", () => {
  expect(computeRelationshipScore(null)).toBe(0);
});

test("stronger recency and frequency yields a higher score", () => {
  const now = new Date("2026-08-19T00:00:00Z");
  const weak = computeRelationshipScore(
    { emailsSent: 1, emailsReceived: 0, meetings: 0, firstInteraction: null, lastInteraction: "2024-01-01T00:00:00Z", reciprocity: null, frequency: null, recency: null, contactSignal: null },
    now
  );
  const strong = computeRelationshipScore(
    { emailsSent: 20, emailsReceived: 22, meetings: 8, firstInteraction: null, lastInteraction: "2026-08-05T00:00:00Z", reciprocity: null, frequency: null, recency: null, contactSignal: null },
    now
  );
  expect(strong).toBeGreaterThan(weak);
});

test("score is always within [0,1]", () => {
  const now = new Date("2026-08-19T00:00:00Z");
  const score = computeRelationshipScore(
    { emailsSent: 500, emailsReceived: 500, meetings: 500, firstInteraction: null, lastInteraction: "2026-08-19T00:00:00Z", reciprocity: 1, frequency: 1, recency: 1, contactSignal: 1 },
    now
  );
  expect(score).toBeLessThanOrEqual(1);
  expect(score).toBeGreaterThanOrEqual(0);
});
