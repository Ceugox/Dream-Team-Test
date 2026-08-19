export type Seniority = "junior" | "pleno" | "senior" | "staff" | "unknown";

export interface ParsedHeadline {
  role: string | null;
  company: string | null;
  seniority: Seniority;
  industryKeywords: string[];
}

const SENIORITY_KEYWORDS: Array<[RegExp, Seniority]> = [
  [/\b(staff|principal|head of|distinguished)\b/i, "staff"],
  [/\b(senior|sr\.?)\b/i, "senior"],
  [/\b(pleno|mid-level)\b/i, "pleno"],
  [/\b(junior|jr\.?|intern|estagiario)\b/i, "junior"],
];

const INDUSTRY_KEYWORDS = [
  "fintech",
  "healthtech",
  "edtech",
  "e-commerce",
  "logistics",
  "payments",
  "banking",
  "insurtech",
];

export function parseHeadline(headline: string | null): ParsedHeadline {
  if (!headline) {
    return { role: null, company: null, seniority: "unknown", industryKeywords: [] };
  }

  const [beforeAt, afterAt] = splitOnAt(headline);
  const role = beforeAt?.trim() || null;
  const company = afterAt?.trim() || null;

  let seniority: Seniority = "unknown";
  for (const [pattern, level] of SENIORITY_KEYWORDS) {
    if (pattern.test(headline)) {
      seniority = level;
      break;
    }
  }

  const lower = headline.toLowerCase();
  const industryKeywords = INDUSTRY_KEYWORDS.filter((kw) => lower.includes(kw));

  return { role, company, seniority, industryKeywords };
}

function splitOnAt(headline: string): [string | null, string | null] {
  const idx = headline.toLowerCase().lastIndexOf(" at ");
  if (idx === -1) return [headline, null];
  return [headline.slice(0, idx), headline.slice(idx + 4)];
}
