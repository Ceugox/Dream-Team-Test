import type { Person } from "../domain/person";

export interface CoverageMetrics {
  companyCoverage: number;
  roleCoverage: number;
  locationCoverage: number;
  strongRelationships: number;
  averageProfileCompleteness: number;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function computeCoverage(people: Person[]): CoverageMetrics {
  const total = people.length;
  const companyCoverage = ratio(people.filter((p) => !!p.currentCompany).length, total);
  const roleCoverage = ratio(people.filter((p) => !!p.currentRole).length, total);
  const locationCoverage = ratio(people.filter((p) => !!p.location).length, total);
  const strongRelationships = people.filter((p) => (p.relationshipScore ?? 0) >= 0.5).length;

  const completenessFields: Array<keyof Person> = ["name", "linkedinUrl", "headline", "currentCompany", "currentRole", "location"];
  const averageProfileCompleteness =
    total === 0
      ? 0
      : people.reduce((sum, p) => sum + completenessFields.filter((f) => !!p[f]).length / completenessFields.length, 0) / total;

  return { companyCoverage, roleCoverage, locationCoverage, strongRelationships, averageProfileCompleteness };
}
