"use client";
import { useMemo, useState } from "react";
import { EditContact } from "@/components/platform/AdminNetworkForms";

export type NetworkListContact = {
  id: string; name: string; headline: string | null; profileContext: string | null;
  phone: string | null; source: string; areaOverride: string | null;
  /** Label da área já resolvido no server (override ou inferência). */
  areaLabelText: string | null; areaIsOverride: boolean;
  networkCapitalScore: number; networkCapitalEvidence: string[];
  publicEnrichmentStatus: string | null;
  publicSources: Array<{ url: string; title: string }>;
};

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export function AdminNetworkList({ contacts }: { contacts: NetworkListContact[] }) {
  const [term, setTerm] = useState("");
  const filtered = useMemo(() => {
    const needle = normalize(term.trim());
    if (!needle) return contacts;
    return contacts.filter(contact =>
      normalize(contact.name).includes(needle) ||
      (contact.areaLabelText && normalize(contact.areaLabelText).includes(needle)));
  }, [contacts, term]);

  return <>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input value={term} onChange={event => setTerm(event.target.value)} type="search" inputMode="search"
        placeholder="Buscar por nome ou área (ex.: Maria, Dados & IA)"
        aria-label="Buscar contatos por nome ou área"
        className="w-full rounded-xl border border-[var(--line)] bg-[#0b0d12] px-4 py-3 text-sm text-white placeholder:text-[#616876] sm:max-w-md" />
      {term.trim() && <p className="shrink-0 text-xs text-[var(--muted)]">{filtered.length} de {contacts.length} contatos</p>}
    </div>
    <div className="mt-4 grid max-h-[70vh] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">{filtered.map(contact => <div key={contact.id} className="rounded-xl border border-[var(--line)] bg-[#0c0e13] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium break-words">{contact.headline || "Contexto ainda incompleto"}</p><SourceBadge source={contact.source} />{contact.areaLabelText && <span className="rounded-full border border-[#3a3357] bg-[#1a1630] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#b9a9ff]" title={contact.areaIsOverride ? "Área definida manualmente" : "Área inferida"}>{contact.areaLabelText}</span>}</div><p className="mt-1 text-xs leading-5 text-[var(--muted)] break-words">{contact.name}</p>{contact.networkCapitalEvidence.length > 0 && <p className="mt-2 text-[10px] leading-4 text-[#b9a9ff]">Capital de rede: {contact.networkCapitalEvidence.join(" · ")}</p>}{contact.publicSources.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{contact.publicSources.slice(0, 2).map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#8ea7ff] underline underline-offset-2">{source.title}</a>)}</div>}</div><div className="shrink-0 text-right">{contact.phone && <span className="block text-xs text-[var(--green)]">WhatsApp ✓</span>}{contact.publicEnrichmentStatus === "enriched" && <span className="mt-2 block text-[10px] text-[var(--green)]">Fonte confirmada</span>}{contact.publicEnrichmentStatus === "unconfirmed" && <span className="mt-2 block text-[10px] text-[var(--amber)]">Identidade ambígua</span>}{contact.networkCapitalScore > 0 && <span className="mt-2 block text-[10px] text-[#b9a9ff]">{Math.round(contact.networkCapitalScore * 100)}% sinal</span>}</div></div><EditContact id={contact.id} headline={contact.headline} profileContext={contact.profileContext} phone={contact.phone} areaOverride={contact.areaOverride} /></div>)}</div>
    {filtered.length === 0 && contacts.length > 0 && <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">Nenhum contato corresponde a “{term.trim()}”. Tente parte do nome ou uma área como “Produto”.</p>}
  </>;
}

function SourceBadge({ source }: { source: string }) { const label = source === "google" ? "Google" : source === "linkedin" ? "LinkedIn" : "Manual"; return <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">{label}</span>; }
