"use client";

import { useEffect, useState } from "react";
import { JobInput } from "@/components/JobInput";
import { CandidateCard } from "@/components/CandidateCard";
import type { Person } from "@/lib/domain/person";

type Candidate = Person & { referralEvidence: string[] };

export default function ReferralsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("referral-copilot:people");
    if (raw) setPeople(JSON.parse(raw));
  }, []);

  async function handleSubmit(jobDescription: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, people }),
      });
      const data = await res.json();
      setCandidates(data.candidates);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Referral Copilot</h1>
      <JobInput onSubmit={handleSubmit} loading={loading} />
      {candidates.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-medium">People you should consider referring</h2>
          <div className="space-y-4">
            {candidates.slice(0, 10).map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
