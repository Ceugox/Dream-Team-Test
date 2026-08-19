// src/components/CandidateCard.tsx
import type { Person } from "@/lib/domain/person";

type Candidate = Person & { referralEvidence: string[] };

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-neutral-100">
        <div className="h-2 rounded bg-black" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-medium">{candidate.name}</p>
          {candidate.headline && <p className="text-sm text-neutral-500">{candidate.headline}</p>}
        </div>
        <span className="text-lg font-semibold">{Math.round((candidate.referralScore ?? 0) * 100)}%</span>
      </div>
      <div className="mt-3 space-y-2">
        <Bar label="Job fit" value={candidate.jobFitScore ?? 0} />
        <Bar label="Relationship" value={candidate.relationshipScore ?? 0} />
      </div>
      {candidate.referralEvidence.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          {candidate.referralEvidence.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
