import { randomUUID } from "node:crypto";
import { collectConnectionInventory, collectProfessionalProfile, type CollectionResult, type ProfileCollectionResult } from "./collectors/pageCollector";
import type { InventoryEntry, ProfessionalProfile } from "./collectors/schemas";
import { assertEncryptedProviderSessionReference } from "./crypto";
import { prioritizeInventory, type OpenJobSignal } from "./prioritization";
import {
  countActiveSessions,
  createSessionWithCapacity,
  findAllExpiredSessions,
  findOwnedSession,
  getPendingProfileUrls,
  markFinished,
  recordEnrichmentResult,
  saveInventoryContact,
  savePendingProfileUrls,
  saveProfileSnapshot,
  transitionOwnedSession,
  type ProfileSnapshotInput,
} from "./sessionRepository";
import { toPublicSession } from "./sessionState";
import type { LinkedInBrowserProvider, RemoteBrowserPage } from "./providers/types";
import type { LinkedInOwner, LinkedInProviderConfig, LinkedInSession, LinkedInSessionStatus, PublicLinkedInSession } from "./types";

const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
const CONSENT_VERSION = "2026-08-20";
const PROFILE_SNAPSHOT_SCHEMA_VERSION = 1;

type FinalStatus = Extract<LinkedInSessionStatus, "completed" | "cancelled" | "failed" | "expired">;

const FINAL_STATUSES: LinkedInSessionStatus[] = ["completed", "cancelled", "failed", "expired"];
const PAUSED_STATUSES: LinkedInSessionStatus[] = ["needs_attention", "paused_rate_limit"];
const ENRICHABLE_STATUSES: LinkedInSessionStatus[] = ["enriching", "results_available"];

export interface SyncRepository {
  createSessionWithCapacity(owner: LinkedInOwner, input: {
    expiresAt: Date;
    providerSessionReference?: string | null;
    consentedAt?: Date | null;
    consentVersion?: string | null;
    status?: LinkedInSessionStatus;
  }, maxActiveSessions: number): Promise<LinkedInSession | null>;
  findOwnedSession(owner: LinkedInOwner, id: string): Promise<LinkedInSession | null>;
  transitionOwnedSession(owner: LinkedInOwner, id: string, status: LinkedInSessionStatus, changes?: {
    failureCode?: string | null;
    failureMessageSafe?: string | null;
  }): Promise<LinkedInSession | null>;
  countActiveSessions(): Promise<number>;
  saveInventoryContact(owner: LinkedInOwner, sessionId: string): Promise<LinkedInSession | null>;
  saveProfileSnapshot(owner: LinkedInOwner, input: ProfileSnapshotInput): Promise<{ id: string; schemaVersion: number } | null>;
  recordEnrichmentResult(owner: LinkedInOwner, sessionId: string, outcome: "enriched" | "failed"): Promise<LinkedInSession | null>;
  markFinished(owner: LinkedInOwner, id: string, status: FinalStatus): Promise<LinkedInSession | null>;
  findAllExpiredSessions(): Promise<LinkedInSession[]>;
  savePendingProfileUrls(owner: LinkedInOwner, sessionId: string, profileUrls: string[]): Promise<void>;
  getPendingProfileUrls(owner: LinkedInOwner, sessionId: string): Promise<string[]>;
}

export const defaultSyncRepository: SyncRepository = {
  createSessionWithCapacity: (owner, input, maxActiveSessions) => createSessionWithCapacity(owner, {
    ...input,
    providerSessionReference: input.providerSessionReference == null
      ? input.providerSessionReference
      : assertEncryptedProviderSessionReference(input.providerSessionReference),
  }, maxActiveSessions),
  findOwnedSession: (owner, id) => findOwnedSession(owner, id),
  transitionOwnedSession: (owner, id, status, changes) => transitionOwnedSession(owner, id, status, changes),
  countActiveSessions: () => countActiveSessions(),
  saveInventoryContact: (owner, sessionId) => saveInventoryContact(owner, sessionId),
  saveProfileSnapshot: (owner, input) => saveProfileSnapshot(owner, input),
  recordEnrichmentResult: (owner, sessionId, outcome) => recordEnrichmentResult(owner, sessionId, outcome),
  markFinished: (owner, id, status) => markFinished(owner, id, status),
  findAllExpiredSessions: () => findAllExpiredSessions(),
  savePendingProfileUrls: (owner, sessionId, profileUrls) => savePendingProfileUrls(owner, sessionId, profileUrls),
  getPendingProfileUrls: (owner, sessionId) => getPendingProfileUrls(owner, sessionId),
};

export interface CollectorRunOptions {
  signal?: AbortSignal;
  delayMs?: number;
  now?: () => Date;
}

export interface SyncServiceDependencies {
  config: LinkedInProviderConfig;
  provider: LinkedInBrowserProvider;
  repository?: SyncRepository;
  collectInventory?: (page: RemoteBrowserPage, options: CollectorRunOptions) => Promise<CollectionResult<InventoryEntry>>;
  collectProfile?: (page: RemoteBrowserPage, profileUrl: string, options: CollectorRunOptions) => Promise<ProfileCollectionResult>;
  readAuthentication?: (page: RemoteBrowserPage) => Promise<boolean>;
  listOpenJobs: () => Promise<OpenJobSignal[]>;
  persistInventory: (owner: LinkedInOwner, entries: InventoryEntry[]) => Promise<void>;
  persistProfile: (owner: LinkedInOwner, profile: ProfessionalProfile) => Promise<void>;
  now?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  loginPollMs?: number;
}

export function isAuthenticatedSignal(input: { url: string; hasNavigation: boolean }): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) return false;
  if (/\/(login|checkpoint|uas|authwall)\b/.test(parsed.pathname.toLowerCase())) return false;
  return input.hasNavigation;
}

async function readAuthenticationSignal(page: RemoteBrowserPage): Promise<boolean> {
  const signal = await page.evaluate<{ url: string; hasNavigation: boolean }>(() => ({
    url: globalThis.location.href,
    hasNavigation: Boolean(globalThis.document.querySelector("#global-nav, header nav, nav[aria-label]")),
  }), { kind: "auth-signal" });
  return isAuthenticatedSignal(signal);
}

function meanConfidence(profile: ProfessionalProfile): number {
  const fields = [
    profile.profileUrl, profile.name, profile.headline, profile.location, profile.summary,
    profile.roles, profile.education, profile.skills, profile.certifications,
    profile.languages, profile.projects, profile.internationalExperience, profile.mutualConnections,
  ].filter((field) => field.value !== null);
  if (!fields.length) return 0;
  return fields.reduce((total, field) => total + field.confidence, 0) / fields.length;
}

function snapshotInput(sessionId: string, linkedinUrl: string, profile: ProfessionalProfile): ProfileSnapshotInput {
  return {
    sessionId,
    linkedinUrl,
    schemaVersion: PROFILE_SNAPSHOT_SCHEMA_VERSION,
    professionalData: profile as unknown as Record<string, unknown>,
    sourceUrl: profile.profileUrl.sourceUrl,
    observedAt: new Date(profile.profileUrl.observedAt),
    extractionConfidence: meanConfidence(profile),
  };
}

export interface InventoryStageResult {
  session: LinkedInSession | null;
  profileUrls: string[];
}

export function createLinkedInSyncService(dependencies: SyncServiceDependencies) {
  const {
    config,
    provider,
    repository = defaultSyncRepository,
    collectInventory = collectConnectionInventory,
    collectProfile = collectProfessionalProfile,
    readAuthentication = readAuthenticationSignal,
    listOpenJobs,
    persistInventory,
    persistProfile,
    now = () => new Date(),
    delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    random = Math.random,
    loginPollMs = 3000,
  } = dependencies;

  const failSafely = (owner: LinkedInOwner, sessionId: string): Promise<LinkedInSession | null> =>
    repository.transitionOwnedSession(owner, sessionId, "failed", {
      failureCode: "sync_error",
      failureMessageSafe: "LinkedIn sync stopped unexpectedly",
    }).catch(() => repository.markFinished(owner, sessionId, "failed"));

  async function createInteractiveSession(owner: LinkedInOwner, input: { consent: boolean }): Promise<{
    session: PublicLinkedInSession;
    interactiveUrl: string;
  }> {
    if (!config.enabled) throw new Error("LINKEDIN_SYNC_DISABLED");
    if (input.consent !== true) throw new Error("LINKEDIN_SYNC_CONSENT_REQUIRED");
    const active = await repository.countActiveSessions();
    if (active >= config.maxConcurrentSessions) throw new Error("LINKEDIN_SYNC_CAPACITY");
    const providerSession = await provider.createSession({ sessionId: randomUUID(), timeoutMs: config.loginTimeoutMs });
    try {
      const session = await repository.createSessionWithCapacity(owner, {
        expiresAt: new Date(now().getTime() + config.sessionTimeoutMs),
        providerSessionReference: providerSession.encryptedReferencePayload,
        consentedAt: now(),
        consentVersion: CONSENT_VERSION,
        status: "preparing",
      }, config.maxConcurrentSessions);
      if (!session) throw new Error("LINKEDIN_SYNC_CAPACITY");
      const awaiting = await repository.transitionOwnedSession(owner, session.id, "awaiting_login") ?? session;
      return { session: toPublicSession(awaiting), interactiveUrl: providerSession.interactiveUrl };
    } catch (error) {
      await provider.destroy(providerSession.encryptedReferencePayload).catch(() => undefined);
      throw error;
    }
  }

  async function runInventoryStage(
    owner: LinkedInOwner,
    sessionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<InventoryStageResult> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return { session: null, profileUrls: [] };
    if (session.status === "enriching") {
      // Reexecução após o worker cair entre a transição e o enqueue: recupera a fila persistida.
      return { session, profileUrls: await repository.getPendingProfileUrls(owner, sessionId) };
    }
    if (session.status !== "awaiting_login") return { session, profileUrls: [] };
    const reference = session.providerSessionReference;
    if (!reference) {
      const failed = await repository.transitionOwnedSession(owner, sessionId, "failed", {
        failureCode: "missing_reference",
        failureMessageSafe: "LinkedIn session reference is unavailable",
      });
      return { session: failed, profileUrls: [] };
    }

    const handle = await provider.connect(reference);
    let destroyReference = false;
    const finish = async (status: FinalStatus): Promise<LinkedInSession | null> => {
      destroyReference = true;
      return repository.markFinished(owner, sessionId, status);
    };

    try {
      const loginDeadline = Math.min(now().getTime() + config.loginTimeoutMs, session.expiresAt.getTime());
      while (!(await readAuthentication(handle.page))) {
        if (options.signal?.aborted) return { session: await finish("cancelled"), profileUrls: [] };
        if (now().getTime() >= loginDeadline) return { session: await finish("expired"), profileUrls: [] };
        await delay(loginPollMs);
      }
      await handle.closeInteractiveUrl();
      if (now().getTime() >= session.expiresAt.getTime()) return { session: await finish("expired"), profileUrls: [] };
      await repository.transitionOwnedSession(owner, sessionId, "authenticated");
      await repository.transitionOwnedSession(owner, sessionId, "inventorying");

      await handle.page.goto(CONNECTIONS_URL, { waitUntil: "domcontentloaded" });
      const inventory = await collectInventory(handle.page, { signal: options.signal, delayMs: config.profileDelayMinMs, now });
      if (inventory.status === "stopped") {
        if (inventory.reason === "aborted") return { session: await finish("cancelled"), profileUrls: [] };
        const status = inventory.reason === "rate_limit" ? "paused_rate_limit" : "needs_attention";
        const paused = await repository.transitionOwnedSession(owner, sessionId, status, { failureCode: inventory.reason });
        return { session: paused, profileUrls: [] };
      }
      await persistInventory(owner, inventory.entries);
      for (let index = 0; index < inventory.entries.length; index += 1) {
        await repository.saveInventoryContact(owner, sessionId);
      }
      const jobs = await listOpenJobs();
      const ordered = prioritizeInventory(inventory.entries, jobs);
      const profileUrls = ordered
        .map((entry) => entry.profileUrl.value)
        .filter((url): url is string => Boolean(url));
      await repository.savePendingProfileUrls(owner, sessionId, profileUrls);
      const enriching = await repository.transitionOwnedSession(owner, sessionId, "enriching");
      return { session: enriching, profileUrls };
    } catch {
      destroyReference = true;
      return { session: await failSafely(owner, sessionId), profileUrls: [] };
    } finally {
      await handle.disconnect().catch(() => undefined);
      if (destroyReference) await provider.destroy(reference).catch(() => undefined);
    }
  }

  async function runProfileStage(
    owner: LinkedInOwner,
    sessionId: string,
    profileUrl: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<LinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (FINAL_STATUSES.includes(session.status) || PAUSED_STATUSES.includes(session.status)) return session;
    if (!ENRICHABLE_STATUSES.includes(session.status)) return session;
    const reference = session.providerSessionReference;
    if (!reference) {
      return repository.transitionOwnedSession(owner, sessionId, "failed", {
        failureCode: "missing_reference",
        failureMessageSafe: "LinkedIn session reference is unavailable",
      });
    }
    const finishWithoutHandle = async (status: FinalStatus): Promise<LinkedInSession | null> => {
      const finished = await repository.markFinished(owner, sessionId, status);
      await provider.destroy(reference).catch(() => undefined);
      return finished;
    };
    if (options.signal?.aborted) return finishWithoutHandle("cancelled");
    if (now().getTime() >= session.expiresAt.getTime()) return finishWithoutHandle("expired");

    const handle = await provider.connect(reference);
    let destroyReference = false;

    try {
      const spread = Math.max(0, config.profileDelayMaxMs - config.profileDelayMinMs);
      const delayMs = config.profileDelayMinMs + Math.floor(random() * (spread + 1));
      const result = await collectProfile(handle.page, profileUrl, { signal: options.signal, delayMs, now });
      if (result.status === "stopped") {
        if (result.reason === "aborted") {
          destroyReference = true;
          return await repository.markFinished(owner, sessionId, "cancelled");
        }
        if (result.reason === "invalid_profile_url") {
          return await repository.recordEnrichmentResult(owner, sessionId, "failed") ?? session;
        }
        if (session.status === "results_available") {
          // results_available não tem aresta para pausa: encerra parcial com o motivo registrado.
          destroyReference = true;
          return await repository.transitionOwnedSession(owner, sessionId, "completed", { failureCode: result.reason });
        }
        const status = result.reason === "rate_limit" ? "paused_rate_limit" : "needs_attention";
        return await repository.transitionOwnedSession(owner, sessionId, status, { failureCode: result.reason });
      }
      await repository.saveProfileSnapshot(owner, snapshotInput(sessionId, profileUrl, result.profile));
      await persistProfile(owner, result.profile);
      const updated = await repository.recordEnrichmentResult(owner, sessionId, "enriched");
      if (session.status === "enriching") {
        return await repository.transitionOwnedSession(owner, sessionId, "results_available") ?? updated;
      }
      return updated;
    } catch {
      destroyReference = true;
      return await failSafely(owner, sessionId);
    } finally {
      await handle.disconnect().catch(() => undefined);
      if (destroyReference) await provider.destroy(reference).catch(() => undefined);
    }
  }

  async function finalizeStage(owner: LinkedInOwner, sessionId: string): Promise<LinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (FINAL_STATUSES.includes(session.status)) return session;
    if (!ENRICHABLE_STATUSES.includes(session.status)) return session;
    const reference = session.providerSessionReference;
    if (session.status === "enriching") {
      await repository.transitionOwnedSession(owner, sessionId, "results_available");
    }
    const finished = await repository.markFinished(owner, sessionId, "completed");
    if (reference) await provider.destroy(reference).catch(() => undefined);
    return finished;
  }

  async function runCollection(
    owner: LinkedInOwner,
    sessionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<LinkedInSession | null> {
    const inventory = await runInventoryStage(owner, sessionId, options);
    if (!inventory.session) return null;
    if (inventory.session.status !== "enriching") return inventory.session;
    let current: LinkedInSession | null = inventory.session;
    for (const profileUrl of inventory.profileUrls) {
      current = await runProfileStage(owner, sessionId, profileUrl, options);
      if (!current || !ENRICHABLE_STATUSES.includes(current.status)) return current;
    }
    return finalizeStage(owner, sessionId);
  }

  async function releaseStuckSession(owner: LinkedInOwner, sessionId: string): Promise<LinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (session.status !== "authenticated" && session.status !== "inventorying") return session;
    const reference = session.providerSessionReference;
    const failed = await repository.transitionOwnedSession(owner, sessionId, "failed", {
      failureCode: "stale_run",
      failureMessageSafe: "LinkedIn sync worker was interrupted mid-collection",
    }).catch(() => repository.markFinished(owner, sessionId, "failed"));
    if (reference) await provider.destroy(reference).catch(() => undefined);
    return failed;
  }

  async function cancelOwnedSession(owner: LinkedInOwner, sessionId: string): Promise<PublicLinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (FINAL_STATUSES.includes(session.status)) return toPublicSession(session);
    const reference = session.providerSessionReference;
    const finished = await repository.markFinished(owner, sessionId, "cancelled") ?? session;
    if (reference) await provider.destroy(reference).catch(() => undefined);
    return toPublicSession(finished);
  }

  async function expireOrphanedSessions(): Promise<number> {
    const sessions = await repository.findAllExpiredSessions();
    for (const session of sessions) {
      const reference = session.providerSessionReference;
      await repository.markFinished(session.owner, session.id, "expired");
      if (reference) await provider.destroy(reference).catch(() => undefined);
    }
    return sessions.length;
  }

  return {
    createInteractiveSession,
    runInventoryStage,
    runProfileStage,
    finalizeStage,
    runCollection,
    cancelOwnedSession,
    releaseStuckSession,
    expireOrphanedSessions,
  };
}

export type LinkedInSyncService = ReturnType<typeof createLinkedInSyncService>;
