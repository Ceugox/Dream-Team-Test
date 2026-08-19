// src/components/SourceStatusList.tsx
"use client";

import type { SourceName, SourceState } from "@/lib/domain/events";

const LABELS: Record<SourceName, string> = {
  linkedin: "LinkedIn",
  gmail: "Gmail",
  contacts: "Contacts",
  calendar: "Calendar",
};

const SYMBOLS: Record<SourceState, string> = {
  pending: "○",
  running: "◌",
  completed: "✓",
  partial: "◐",
  failed: "✗",
};

export function SourceStatusList({ statuses }: { statuses: Record<SourceName, SourceState> }) {
  return (
    <ul className="flex gap-6 text-sm font-mono">
      {(Object.keys(LABELS) as SourceName[]).map((source) => (
        <li key={source} className="flex items-center gap-2">
          <span aria-hidden>{SYMBOLS[statuses[source] ?? "pending"]}</span>
          <span>{LABELS[source]}</span>
        </li>
      ))}
    </ul>
  );
}
