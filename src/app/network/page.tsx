"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PersonCard } from "@/components/PersonCard";
import { NetworkMetricsPanel } from "@/components/NetworkMetricsPanel";
import type { Person } from "@/lib/domain/person";

export default function NetworkPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("referral-copilot:people");
    if (raw) setPeople(JSON.parse(raw));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.currentCompany, p.currentRole, p.headline].some((f) => f?.toLowerCase().includes(q))
    );
  }, [people, query]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Professional Network</h1>
      <div className="my-6">
        <NetworkMetricsPanel people={people} />
      </div>
      <input
        placeholder="Search by name, company, or role"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 w-full rounded border border-neutral-300 px-3 py-2"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
      <Link href="/referrals" className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white">
        Continue to Referral Copilot
      </Link>
    </div>
  );
}
