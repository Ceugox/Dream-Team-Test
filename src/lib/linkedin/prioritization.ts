import type { InventoryEntry } from "./collectors/schemas";

export interface OpenJobSignal {
  title: string;
  company?: string | null;
  location?: string | null;
  skills?: string[];
}

const stopWords = new Set(["of", "at", "the", "and", "de", "da", "do", "em", "para", "head", "senior", "junior", "pleno"]);

function tokens(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9+]+/)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function overlap(candidate: Set<string>, reference: Set<string>): number {
  let matches = 0;
  for (const token of reference) if (candidate.has(token)) matches += 1;
  return matches;
}

function scoreAgainstJob(entryTokens: Set<string>, locationTokens: Set<string>, job: OpenJobSignal): number {
  const titleMatches = overlap(entryTokens, tokens(job.title));
  const companyMatches = overlap(entryTokens, tokens(job.company));
  const skillMatches = Math.min(overlap(entryTokens, tokens((job.skills ?? []).join(" "))), 3);
  const locationMatches = overlap(locationTokens, tokens(job.location));
  return titleMatches * 3 + companyMatches * 2 + skillMatches * 1.5 + Math.min(locationMatches, 1);
}

export function scoreInventoryEntry(entry: InventoryEntry, jobs: OpenJobSignal[]): number {
  const entryTokens = tokens([entry.headline.value, entry.name.value].filter(Boolean).join(" "));
  const locationTokens = tokens(entry.location.value);
  return jobs.reduce((best, job) => Math.max(best, scoreAgainstJob(entryTokens, locationTokens, job)), 0);
}

export function prioritizeInventory(entries: InventoryEntry[], jobs: OpenJobSignal[]): InventoryEntry[] {
  if (!jobs.length) return [...entries];
  return [...entries]
    .map((entry) => ({ entry, score: scoreInventoryEntry(entry, jobs), url: entry.profileUrl.value ?? "" }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .map((item) => item.entry);
}
