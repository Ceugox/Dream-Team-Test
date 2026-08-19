import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeCandidateFit } from "./candidateFit";

const job = JobProfileSchema.parse({
  title: "Senior Backend Engineer",
  description: "...",
  requiredSkills: ["python", "aws"],
  preferredSkills: ["kotlin"],
  seniority: "senior",
  location: "Sao Paulo",
  industry: "fintech",
});

test("strong match scores high across all sub-dimensions", () => {
  const person = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    headline: "Senior Backend Engineer, Python, Fintech at Nubank",
    currentRole: "Senior Backend Engineer",
    location: "Sao Paulo",
    skills: ["python", "aws", "kotlin"],
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.skillsFit).toBeGreaterThan(0.6);
  expect(fit.seniorityFit).toBe(1);
  expect(fit.locationFit).toBe(1);
  expect(fit.score).toBeGreaterThan(0.6);
});

test("weak match scores low", () => {
  const person = createPerson({
    id: "2",
    name: "Vitoria Prado",
    headline: "Sales Executive at Salesforce",
    skills: ["salesforce", "negotiation"],
    location: "Rio de Janeiro",
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.score).toBeLessThan(0.4);
});

test("score is a weighted sum matching the spec formula", () => {
  const person = createPerson({ id: "3", name: "Test", skills: ["python"], location: "Sao Paulo" });
  const fit = computeCandidateFit(person, job);
  const expected =
    0.35 * fit.skillsFit + 0.25 * fit.roleFit + 0.15 * fit.seniorityFit + 0.15 * fit.industryFit + 0.1 * fit.locationFit;
  expect(fit.score).toBeCloseTo(expected, 5);
});

test("javascript skill does not falsely match a job requiring java (word-boundary, not substring)", () => {
  const javaJob = JobProfileSchema.parse({
    title: "Java Backend Engineer",
    description: "...",
    requiredSkills: ["java"],
    preferredSkills: [],
    seniority: "senior",
  });
  const person = createPerson({
    id: "4",
    name: "Test JS",
    headline: "Senior Frontend Engineer",
    skills: ["javascript"],
  });
  const fit = computeCandidateFit(person, javaJob);
  expect(fit.skillsFit).toBe(0);
});
