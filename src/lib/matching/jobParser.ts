import { JobProfileSchema, type JobProfile } from "../domain/job";

const SENIORITY_KEYWORDS: Array<[RegExp, JobProfile["seniority"]]> = [
  [/\b(staff|principal)\b/i, "staff"],
  [/\bsenior\b/i, "senior"],
  [/\bpleno\b/i, "pleno"],
  [/\bjunior\b/i, "junior"],
];

const KNOWN_SKILLS = [
  "python",
  "kotlin",
  "java",
  "go",
  "golang",
  "typescript",
  "javascript",
  "react",
  "aws",
  "gcp",
  "azure",
  "kafka",
  "distributed systems",
  "kubernetes",
  "sql",
];

const INDUSTRY_KEYWORDS = ["fintech", "healthtech", "edtech", "e-commerce", "logistics", "payments", "banking"];

function extractSkillsFromLine(line: string): string[] {
  const lower = line.toLowerCase();
  return KNOWN_SKILLS.filter((skill) => lower.includes(skill));
}

export function parseJobDescription(rawText: string, titleHint?: string): JobProfile {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines[0] ?? "";
  const hasTitleFormat = titleLine.includes(" - ");

  let title: string;
  let company: string | null = null;
  let location: string | null = null;

  if (hasTitleFormat) {
    const titleParts = titleLine.split(" - ").map((p) => p.trim());
    title = titleParts[0] || titleHint || "Unknown role";
    company = titleParts[1] ?? null;
    location = titleParts[2] ?? null;
  } else {
    title = titleHint || "Unknown role";
  }

  let seniority: JobProfile["seniority"] = "unknown";
  for (const [pattern, level] of SENIORITY_KEYWORDS) {
    if (pattern.test(rawText)) {
      seniority = level;
      break;
    }
  }

  const requiredLine = lines.find((l) => /^required:/i.test(l)) ?? "";
  const preferredLine = lines.find((l) => /^nice to have:/i.test(l)) ?? "";
  const requiredSkills = extractSkillsFromLine(requiredLine);
  const preferredSkills = extractSkillsFromLine(preferredLine).filter((s) => !requiredSkills.includes(s));

  const lower = rawText.toLowerCase();
  const industry = INDUSTRY_KEYWORDS.find((kw) => lower.includes(kw)) ?? null;

  return JobProfileSchema.parse({
    title,
    company,
    description: rawText,
    requiredSkills,
    preferredSkills,
    seniority,
    location,
    industry,
  });
}
