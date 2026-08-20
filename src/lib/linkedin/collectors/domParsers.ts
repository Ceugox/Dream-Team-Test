import {
  LINKEDIN_SELECTOR_VERSION,
  inventoryEntrySchema,
  professionalProfileSchema,
  type InventoryEntry,
  type ObservedField,
  type ProfessionalProfile,
  type RawInventoryEntry,
  type RawProfessionalProfile,
} from "./schemas";

export { LINKEDIN_SELECTOR_VERSION } from "./schemas";

interface ObservationContext {
  sourceUrl: string;
  observedAt: string;
}

const semanticConfidence = 0.95;
const fallbackConfidence = 0.65;

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function attribute(markup: string, name: string): string | null {
  const match = markup.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match ? clean(match[1]) : null;
}

function tagText(markup: string, attributeName: string, attributeValue: string): string | null {
  const escaped = attributeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markup.match(new RegExp(`<(\\w+)[^>]*\\b${attributeName}=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"));
  return clean(match?.[2]);
}

function allTagText(markup: string, attributeName: string): string[] {
  const pattern = new RegExp(`<[^>]*\\b${attributeName}(?:=["'][^"']*["'])?[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "gi");
  return [...markup.matchAll(pattern)].map((match) => clean(match[1])).filter((value): value is string => value !== null);
}

function articles(markup: string, marker: string): string[] {
  const pattern = new RegExp(`<article[^>]*\\b${marker}(?:=["'][^"']*["'])?[^>]*>([\\s\\S]*?)<\\/article>`, "gi");
  return [...markup.matchAll(pattern)].map((match) => match[1]);
}

function sectionText(markup: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = markup.match(new RegExp(`<section[^>]*>[\\s\\S]*?<h[1-6][^>]*>\\s*${escaped}\\s*<\\/h[1-6]>([\\s\\S]*?)<\\/section>`, "i"));
  return clean(section?.[1]);
}

function observed<T>(value: T | null, context: ObservationContext, fallback = false): ObservedField<T> {
  return { value, sourceUrl: context.sourceUrl, observedAt: context.observedAt, confidence: fallback ? fallbackConfidence : semanticConfidence };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function partialDate(value: string | null): string | null {
  return value && /^\d{4}(?:-(0[1-9]|1[0-2]))?$/.test(value) ? value : null;
}

export function canonicalizeLinkedInProfileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://www.linkedin.com");
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || hostname !== "linkedin.com" || !/^\/in\/[^/]+\/?$/i.test(url.pathname)) return null;
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

function inventoryFromHtml(markup: string): RawInventoryEntry[] {
  return articles(markup, "data-linkedin-connection").map((article) => {
    const anchor = article.match(/<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const image = article.match(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
    return {
      name: clean(anchor?.[2]) ?? undefined,
      url: clean(anchor?.[1]) ?? undefined,
      headline: tagText(article, "data-field", "headline") ?? undefined,
      location: tagText(article, "data-field", "location") ?? undefined,
      connectionDegree: tagText(article, "data-field", "degree") ?? undefined,
      photoUrl: clean(image?.[1]) ?? undefined,
    };
  });
}

export function parseConnectionInventory(input: string | RawInventoryEntry[], context: ObservationContext): InventoryEntry[] {
  const candidates = typeof input === "string" ? inventoryFromHtml(input) : input;
  const byUrl = new Map<string, InventoryEntry>();
  for (const candidate of candidates) {
    const profileUrl = canonicalizeLinkedInProfileUrl(candidate.url);
    if (!profileUrl || byUrl.has(profileUrl)) continue;
    const fallback = candidate.fallback === true;
    byUrl.set(profileUrl, inventoryEntrySchema.parse({
      selectorVersion: LINKEDIN_SELECTOR_VERSION,
      profileUrl: observed(profileUrl, context, fallback),
      name: observed(clean(candidate.name), context, fallback),
      headline: observed(clean(candidate.headline), context, fallback),
      photoUrl: observed(clean(candidate.photoUrl), context, fallback),
      location: observed(clean(candidate.location), context, fallback),
      connectionDegree: observed(clean(candidate.connectionDegree), context, fallback),
    }));
  }
  return [...byUrl.values()];
}

function profileFromHtml(markup: string): RawProfessionalProfile {
  const roles = articles(markup, "data-role").map((article) => ({
    title: tagText(article, "data-field", "title"), company: tagText(article, "data-field", "company"),
    startDate: partialDate(attribute(article, "data-start")), endDate: partialDate(attribute(article, "data-end")),
  }));
  const education = articles(markup, "data-education").map((article) => ({
    school: tagText(article, "data-field", "school"), degree: tagText(article, "data-field", "degree"),
    startDate: partialDate(attribute(article, "data-start")), endDate: partialDate(attribute(article, "data-end")),
  }));
  const certifications = articles(markup, "data-certification").map((article) => ({
    name: tagText(article, "data-field", "name"), issuer: tagText(article, "data-field", "issuer"),
    issuedDate: partialDate(attribute(article, "data-start")),
  }));
  const projects = articles(markup, "data-project").map((article) => ({
    name: tagText(article, "data-field", "name"), description: tagText(article, "data-field", "description"),
  }));
  const summary = tagText(markup, "data-field", "summary");
  const fallbackSummary = summary ?? sectionText(markup, "About");
  const h1 = markup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mutual = tagText(markup, "data-mutual", "") ?? allTagText(markup, "data-mutual")[0] ?? null;
  const mutualConnections = mutual?.match(/\d+/)?.[0];
  return {
    name: clean(h1?.[1]) ?? undefined,
    headline: tagText(markup, "data-field", "headline") ?? undefined,
    location: tagText(markup, "data-field", "location") ?? undefined,
    summary: fallbackSummary ?? undefined,
    fallbackFields: summary ? [] : fallbackSummary ? ["summary"] : [],
    roles, education,
    skills: allTagText(markup, "data-skill"),
    certifications,
    languages: allTagText(markup, "data-language"),
    projects,
    internationalExperience: allTagText(markup, "data-international").flatMap((value) => value.split(",").map((part) => part.trim())),
    mutualConnections: mutualConnections ? Number(mutualConnections) : undefined,
  };
}

export function parseProfessionalProfile(input: string | RawProfessionalProfile, context: ObservationContext): ProfessionalProfile {
  const raw = typeof input === "string" ? profileFromHtml(input) : input;
  const fallback = new Set(raw.fallbackFields ?? []);
  const list = <T>(value: T[] | undefined): T[] | null => value?.length ? value : null;
  const roles = raw.roles?.map((role) => ({
    title: role.title ?? null, company: role.company ?? null,
    startDate: partialDate(role.startDate), endDate: partialDate(role.endDate),
  }));
  const education = raw.education?.map((entry) => ({
    school: entry.school ?? null, degree: entry.degree ?? null,
    startDate: partialDate(entry.startDate), endDate: partialDate(entry.endDate),
  }));
  const certifications = raw.certifications?.map((entry) => ({
    name: entry.name ?? null, issuer: entry.issuer ?? null, issuedDate: partialDate(entry.issuedDate),
  }));
  const projects = raw.projects?.map((entry) => ({
    name: entry.name ?? null, description: entry.description ?? null,
  }));
  return professionalProfileSchema.parse({
    selectorVersion: LINKEDIN_SELECTOR_VERSION,
    profileUrl: observed(canonicalizeLinkedInProfileUrl(context.sourceUrl), context),
    name: observed(clean(raw.name), context, fallback.has("name")),
    headline: observed(clean(raw.headline), context, fallback.has("headline")),
    location: observed(clean(raw.location), context, fallback.has("location")),
    summary: observed(clean(raw.summary), context, fallback.has("summary")),
    roles: observed(list(roles), context, fallback.has("roles")),
    education: observed(list(education), context, fallback.has("education")),
    skills: observed(list(raw.skills ? unique(raw.skills) : undefined), context, fallback.has("skills")),
    certifications: observed(list(certifications), context, fallback.has("certifications")),
    languages: observed(list(raw.languages ? unique(raw.languages) : undefined), context, fallback.has("languages")),
    projects: observed(list(projects), context, fallback.has("projects")),
    internationalExperience: observed(list(raw.internationalExperience ? unique(raw.internationalExperience) : undefined), context, fallback.has("internationalExperience")),
    mutualConnections: observed(raw.mutualConnections ?? null, context, fallback.has("mutualConnections")),
  });
}
