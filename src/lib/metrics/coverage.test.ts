import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { computeCoverage } from "./coverage";

test("computes coverage percentages across the population", () => {
  const people = [
    createPerson({ id: "1", currentCompany: "Nubank", currentRole: "Engineer", location: "SP", relationshipScore: 0.8 }),
    createPerson({ id: "2", currentCompany: null, currentRole: "Engineer", location: null, relationshipScore: 0.2 }),
  ];
  const coverage = computeCoverage(people);
  expect(coverage.companyCoverage).toBe(0.5);
  expect(coverage.roleCoverage).toBe(1);
  expect(coverage.locationCoverage).toBe(0.5);
  expect(coverage.strongRelationships).toBe(1);
});

test("handles an empty population without dividing by zero", () => {
  const coverage = computeCoverage([]);
  expect(coverage.companyCoverage).toBe(0);
  expect(coverage.strongRelationships).toBe(0);
});
