import { INDUSTRY_KEYWORDS, detectSeniority, type Seniority } from "../matching/vocabulary";

export type { Seniority };

export interface ParsedHeadline {
  role: string | null;
  company: string | null;
  seniority: Seniority;
  industryKeywords: string[];
}

export function parseHeadline(headline: string | null): ParsedHeadline {
  if (!headline) {
    return { role: null, company: null, seniority: "unknown", industryKeywords: [] };
  }

  const [beforeAt, afterAt] = splitOnAt(headline);
  const role = beforeAt?.trim() || null;
  const company = afterAt?.trim() || null;

  const seniority = detectSeniority(headline);

  const lower = headline.toLowerCase();
  const industryKeywords = INDUSTRY_KEYWORDS.filter((kw) => lower.includes(kw));

  return { role, company, seniority, industryKeywords };
}

function splitOnAt(headline: string): [string | null, string | null] {
  const idx = headline.toLowerCase().lastIndexOf(" at ");
  if (idx === -1) return [headline, null];
  return [headline.slice(0, idx), headline.slice(idx + 4)];
}
