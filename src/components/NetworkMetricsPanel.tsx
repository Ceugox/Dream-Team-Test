// src/components/NetworkMetricsPanel.tsx
import { computeCoverage } from "@/lib/metrics/coverage";
import type { Person } from "@/lib/domain/person";

export function NetworkMetricsPanel({ people }: { people: Person[] }) {
  const coverage = computeCoverage(people);
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
      <div>
        <dt className="text-neutral-500">Unique people</dt>
        <dd className="text-2xl font-semibold">{people.length}</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Company coverage</dt>
        <dd className="text-2xl font-semibold">{Math.round(coverage.companyCoverage * 100)}%</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Role coverage</dt>
        <dd className="text-2xl font-semibold">{Math.round(coverage.roleCoverage * 100)}%</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Strong relationships</dt>
        <dd className="text-2xl font-semibold">{coverage.strongRelationships}</dd>
      </div>
    </dl>
  );
}
