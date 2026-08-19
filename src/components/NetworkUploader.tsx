// src/components/NetworkUploader.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SourceStatusList } from "./SourceStatusList";
import type { PipelineEvent, SourceName, SourceState } from "@/lib/domain/events";
import type { Person } from "@/lib/domain/person";

export function NetworkUploader() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<Record<SourceName, SourceState>>({
    linkedin: "pending",
    gmail: "pending",
    contacts: "pending",
    calendar: "pending",
  });
  const [metrics, setMetrics] = useState({ peopleDiscovered: 0, uniquePeople: 0, profilesEnriched: 0, strongRelationships: 0 });

  async function startMapping() {
    setRunning(true);
    const registry = new Map<string, Person>();

    const formData = new FormData();
    if (file) formData.append("file", file);

    const res = await fetch("/api/network", { method: "POST", body: formData });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event: PipelineEvent = JSON.parse(line.slice(6));

        if (event.type === "source.status") {
          setStatuses((prev) => ({ ...prev, [event.source]: event.state }));
        } else if (event.type === "network.person_discovered") {
          registry.set(event.person.id, event.person);
        } else if (event.type === "network.person_merged") {
          registry.delete(event.mergedId);
          registry.set(event.survivorId, event.mergedPerson);
        } else if (event.type === "network.metrics_updated") {
          setMetrics(event);
        } else if (event.type === "network.completed") {
          sessionStorage.setItem("referral-copilot:people", JSON.stringify(Array.from(registry.values())));
          router.push("/network");
        }
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-16">
      <h1 className="text-3xl font-semibold">Map my professional network</h1>
      <p className="max-w-lg text-center text-sm text-neutral-500">
        Upload the connections.json you exported with the console script (see /public/linkedin-console-script.js),
        or skip this step to run on demo data.
      </p>
      <input
        type="file"
        accept="application/json"
        disabled={running}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={startMapping}
        disabled={running}
        className="rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {running ? "Mapping your professional network..." : "Map my professional network"}
      </button>

      {running && (
        <div className="flex flex-col items-center gap-4">
          <SourceStatusList statuses={statuses} />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt>People discovered</dt>
            <dd>{metrics.peopleDiscovered}</dd>
            <dt>Unique identities</dt>
            <dd>{metrics.uniquePeople}</dd>
            <dt>Profiles enriched</dt>
            <dd>{metrics.profilesEnriched}</dd>
            <dt>Strong relationships</dt>
            <dd>{metrics.strongRelationships}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
