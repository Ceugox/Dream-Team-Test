import { JobProfileSchema, type JobProfile } from "../domain/job";
import { detectIndustry, detectSeniority, extractSkills } from "./vocabulary";

function extractSkillsFromLine(line: string): string[] {
  return extractSkills(line);
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

  // O título entra junto: "Engenheiro de Software Sênior" costuma ser o único lugar com a senioridade.
  const seniority = detectSeniority(`${titleHint ?? ""}\n${rawText}`);

  const requiredLine = lines.find((l) => /^required:/i.test(l)) ?? "";
  const preferredLine = lines.find((l) => /^nice to have:/i.test(l)) ?? "";
  const lineRequiredSkills = extractSkillsFromLine(requiredLine);
  const linePreferredSkills = extractSkillsFromLine(preferredLine);

  const fullTextSkills = extractSkillsFromLine(rawText);
  const requiredSkills = Array.from(
    new Set([...lineRequiredSkills, ...fullTextSkills.filter((s) => !linePreferredSkills.includes(s))])
  );
  const preferredSkills = linePreferredSkills.filter((s) => !requiredSkills.includes(s));

  const industry = detectIndustry(rawText);

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
