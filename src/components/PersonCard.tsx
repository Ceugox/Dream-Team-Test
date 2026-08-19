// src/components/PersonCard.tsx
import type { Person } from "@/lib/domain/person";

export function PersonCard({ person }: { person: Person }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="font-medium">{person.name ?? "Unknown"}</p>
      {person.headline && <p className="text-sm text-neutral-500">{person.headline}</p>}
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-neutral-400">
        {person.currentCompany && <span>{person.currentCompany}</span>}
        {person.location && <span>· {person.location}</span>}
      </div>
    </div>
  );
}
