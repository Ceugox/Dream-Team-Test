import { canonicalizeLinkedInProfileUrl, parseConnectionInventory, parseProfessionalProfile } from "./domParsers";
import type { InventoryEntry, ProfessionalProfile, RawInventoryEntry, RawProfessionalProfile } from "./schemas";
import type { RemoteBrowserPage } from "../providers/types";

export type CollectionStopReason = "checkpoint" | "captcha" | "rate_limit" | "aborted" | "invalid_profile_url";
type PageStopReason = "checkpoint" | "captcha" | "rate_limit";
export type CollectionResult<T> = { status: "complete"; entries: T[] } | { status: "stopped"; reason: CollectionStopReason };
export type ProfileCollectionResult = { status: "complete"; profile: ProfessionalProfile } | { status: "stopped"; reason: CollectionStopReason };

export type RemotePage = RemoteBrowserPage;

interface CollectorOptions {
  signal?: AbortSignal;
  delay?: (milliseconds: number) => Promise<void>;
  delayMs?: number;
  now?: () => Date;
}

interface InventoryOptions extends CollectorOptions {
  maxScrolls?: number;
}

interface PageSignal {
  kind: "page-signal";
  stop: PageStopReason | null;
}

const queues = new WeakMap<RemotePage, Promise<void>>();

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function observationTime(now: (() => Date) | undefined): string {
  return (now?.() ?? new Date()).toISOString();
}

function aborted(signal: AbortSignal | undefined): { status: "stopped"; reason: "aborted" } | null {
  return signal?.aborted ? { status: "stopped", reason: "aborted" } : null;
}

async function pageSignal(page: RemotePage): Promise<PageStopReason | null> {
  const signal = await page.evaluate<PageSignal>(() => {
    const url = globalThis.location.href.toLowerCase();
    const text = globalThis.document.body.innerText.toLowerCase();
    if (url.includes("checkpoint") || text.includes("security checkpoint")) return { kind: "page-signal", stop: "checkpoint" };
    if (url.includes("captcha") || text.includes("captcha") || text.includes("verify you are human")) return { kind: "page-signal", stop: "captcha" };
    if (text.includes("too many requests") || /(?:error|status|http)\s*429\b/.test(text) || text.includes("rate limit")) return { kind: "page-signal", stop: "rate_limit" };
    return { kind: "page-signal", stop: null };
  }, { kind: "page-signal" });
  return signal.stop;
}

async function inventoryDom(page: RemotePage): Promise<RawInventoryEntry[]> {
  return page.evaluate<RawInventoryEntry[]>(() => {
    const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, " ").trim() || undefined;
    return [...document.querySelectorAll('a[href*="/in/"]')].map((element) => {
      const anchor = element as HTMLAnchorElement;
      const card = anchor.closest("li, article, div");
      const cardText = text(card);
      const image = card?.querySelector("img")?.getAttribute("src") || undefined;
      const degree = cardText?.match(/\b[123](?:st|nd|rd)\b/i)?.[0];
      return {
        name: text(anchor),
        url: anchor.href || anchor.getAttribute("href") || undefined,
        headline: card?.querySelector('[data-field="headline"], [aria-label="Headline"]')?.textContent?.trim() || undefined,
        location: card?.querySelector('[data-field="location"], [aria-label="Location"]')?.textContent?.trim() || undefined,
        connectionDegree: degree,
        photoUrl: image,
        fallback: true,
      };
    });
  }, { kind: "inventory-dom" });
}

async function profileDom(page: RemotePage): Promise<RawProfessionalProfile> {
  return page.evaluate<RawProfessionalProfile>(() => {
    const fallbackFields = new Set<string>();
    const markFallback = (field: string) => { fallbackFields.add(field); };
    const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || undefined;
    const section = (names: string[]) => [...document.querySelectorAll("section")].find((candidate) => {
      const heading = clean(candidate.querySelector("h1,h2,h3")?.textContent)?.toLowerCase();
      return heading ? names.some((name) => heading.includes(name)) : false;
    });
    const pick = (field: string, root: ParentNode | null | undefined, primary: string, fallbackSelector: string | null) => {
      const semantic = clean(root?.querySelector(primary)?.textContent);
      if (semantic) return semantic;
      if (!fallbackSelector) return undefined;
      const fallbackValue = clean(root?.querySelector(fallbackSelector)?.textContent);
      if (fallbackValue) markFallback(field);
      return fallbackValue;
    };
    const fields = (field: string, root: Element | null | undefined, primary: string, fallbackSelector: string) => {
      const semantic = [...(root?.querySelectorAll(primary) ?? [])]
        .map((element) => clean(element.textContent)).filter((value): value is string => Boolean(value));
      if (semantic.length) return semantic;
      const fallbackValues = [...(root?.querySelectorAll(fallbackSelector) ?? [])]
        .map((element) => clean(element.textContent)).filter((value): value is string => Boolean(value));
      if (fallbackValues.length) markFallback(field);
      return fallbackValues;
    };
    const parseEntries = <T extends Record<string, string | null>>(root: Element | undefined, mapper: (entry: Element) => T): T[] =>
      [...(root?.querySelectorAll("article, li") ?? [])].map(mapper);
    const experience = section(["experience"]);
    const education = section(["education"]);
    const certification = section(["certification", "license"]);
    const project = section(["project"]);
    const mutual = section(["mutual"]);
    const mutualText = clean(mutual?.textContent);
    const mutualCount = mutualText?.match(/\d+/)?.[0];
    if (mutualCount !== undefined) markFallback("mutualConnections");
    const date = (value: string | null | undefined) => value && /^\d{4}(?:-(0[1-9]|1[0-2]))?$/.test(value) ? value : null;
    const result = {
      name: clean(document.querySelector("h1")?.textContent),
      headline: pick("headline", document, '[data-field="headline"]', '[aria-label="Headline"]'),
      location: pick("location", document, '[data-field="location"]', '[aria-label="Location"]'),
      summary: pick("summary", document, '[data-field="summary"]', null)
        ?? pick("summary", section(["about", "summary"]), '[data-field="summary"]', "p"),
      roles: parseEntries(experience, (entry) => ({
        title: pick("roles", entry, '[data-field="title"]', "h3, strong") ?? null,
        company: clean(entry.querySelector('[data-field="company"]')?.textContent) ?? null,
        startDate: date(entry.querySelector("time")?.getAttribute("data-start")),
        endDate: date(entry.querySelector("time")?.getAttribute("data-end")),
      })),
      education: parseEntries(education, (entry) => ({
        school: pick("education", entry, '[data-field="school"]', "h3, strong") ?? null,
        degree: clean(entry.querySelector('[data-field="degree"]')?.textContent) ?? null,
        startDate: date(entry.querySelector("time")?.getAttribute("data-start")),
        endDate: date(entry.querySelector("time")?.getAttribute("data-end")),
      })),
      skills: fields("skills", section(["skills"]), "[data-skill]", "li, a"),
      certifications: parseEntries(certification, (entry) => ({
        name: pick("certifications", entry, '[data-field="name"]', "h3, strong") ?? null,
        issuer: clean(entry.querySelector('[data-field="issuer"]')?.textContent) ?? null,
        issuedDate: date(entry.querySelector("time")?.getAttribute("data-start")),
      })),
      languages: fields("languages", section(["languages"]), "[data-language]", "li, a"),
      projects: parseEntries(project, (entry) => ({
        name: pick("projects", entry, '[data-field="name"]', "h3, strong") ?? null,
        description: pick("projects", entry, '[data-field="description"]', "p") ?? null,
      })),
      internationalExperience: fields("internationalExperience", section(["international"]), "[data-international]", "li, p"),
      mutualConnections: mutualCount !== undefined ? Number(mutualCount) : undefined,
    };
    return { ...result, fallbackFields: [...fallbackFields] };
  }, { kind: "profile-dom" });
}

async function scroll(page: RemotePage): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" }), { kind: "scroll" });
}

function serialize<T>(page: RemotePage, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(page) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  queues.set(page, previous.then(() => current));
  return previous.then(operation).finally(release);
}

export function collectConnectionInventory(page: RemotePage, options: InventoryOptions = {}): Promise<CollectionResult<InventoryEntry>> {
  return serialize(page, async () => {
    const initialAbort = aborted(options.signal);
    if (initialAbort) return initialAbort;
    const stop = await pageSignal(page);
    if (stop) return { status: "stopped", reason: stop };
    const entries = new Map<string, InventoryEntry>();
    const maxScrolls = Math.max(0, Math.min(options.maxScrolls ?? 3, 10));
    const delay = options.delay ?? defaultDelay;
    for (let iteration = 0; iteration <= maxScrolls; iteration += 1) {
      const cancelled = aborted(options.signal);
      if (cancelled) return cancelled;
      const afterLoadStop = await pageSignal(page);
      if (afterLoadStop) return { status: "stopped", reason: afterLoadStop };
      for (const entry of parseConnectionInventory(await inventoryDom(page), { sourceUrl: page.url(), observedAt: observationTime(options.now) })) {
        const profileUrl = entry.profileUrl.value;
        if (profileUrl) entries.set(profileUrl, entry);
      }
      if (iteration === maxScrolls) break;
      await scroll(page);
      await delay(options.delayMs ?? 0);
    }
    return { status: "complete", entries: [...entries.values()] };
  });
}

export function collectProfessionalProfile(page: RemotePage, profileUrl: string, options: CollectorOptions = {}): Promise<ProfileCollectionResult> {
  return serialize(page, async () => {
    const cancelled = aborted(options.signal);
    if (cancelled) return cancelled;
    const target = canonicalizeLinkedInProfileUrl(profileUrl);
    if (!target) return { status: "stopped", reason: "invalid_profile_url" };
    const beforeNavigation = await pageSignal(page);
    if (beforeNavigation) return { status: "stopped", reason: beforeNavigation };
    await page.goto(target, { waitUntil: "domcontentloaded" });
    await (options.delay ?? defaultDelay)(options.delayMs ?? 0);
    const afterNavigationAbort = aborted(options.signal);
    if (afterNavigationAbort) return afterNavigationAbort;
    const stop = await pageSignal(page);
    if (stop) return { status: "stopped", reason: stop };
    return {
      status: "complete",
      profile: parseProfessionalProfile(await profileDom(page), { sourceUrl: target, observedAt: observationTime(options.now) }),
    };
  });
}
