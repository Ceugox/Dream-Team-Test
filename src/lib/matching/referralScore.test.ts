import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeReferralScore, explainMatch } from "./referralScore";
import type { CandidateFitResult } from "./candidateFit";

test("computeReferralScore matches the spec formula exactly", () => {
  const score = computeReferralScore(0.8, 0.6, 0.9);
  const expected = 0.8 * (0.7 + 0.3 * 0.6) * 0.9;
  expect(score).toBeCloseTo(expected, 5);
});

test("higher relationship score yields higher referral score for the same fit and confidence", () => {
  const low = computeReferralScore(0.7, 0.1, 1);
  const high = computeReferralScore(0.7, 0.9, 1);
  expect(high).toBeGreaterThan(low);
});

test("lower confidence penalizes referral score", () => {
  const confident = computeReferralScore(0.7, 0.5, 1);
  const unsure = computeReferralScore(0.7, 0.5, 0.4);
  expect(unsure).toBeLessThan(confident);
});

test("explainMatch only cites evidence actually present on the person", () => {
  const job = JobProfileSchema.parse({
    title: "Senior Backend Engineer",
    description: "...",
    requiredSkills: ["python"],
    seniority: "senior",
    location: "Sao Paulo",
    industry: "fintech",
  });
  const person = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    headline: "Senior Backend Engineer, Fintech at Nubank",
    skills: ["python"],
    location: "Sao Paulo",
    relationship: {
      emailsSent: 14, emailsReceived: 18, meetings: 5,
      firstInteraction: null, lastInteraction: "2026-07-20T00:00:00Z",
      reciprocity: null, frequency: null, recency: null, contactSignal: null,
    },
  });
  const fit: CandidateFitResult = { score: 0.9, skillsFit: 1, roleFit: 1, seniorityFit: 1, industryFit: 1, locationFit: 1 };
  const evidence = explainMatch(person, job, fit);
  expect(evidence.some((e) => e.toLowerCase().includes("python"))).toBe(true);
  expect(evidence.some((e) => e.toLowerCase().includes("sao paulo"))).toBe(true);
  expect(evidence.some((e) => e.includes("5") && e.toLowerCase().includes("meeting"))).toBe(true);
});
