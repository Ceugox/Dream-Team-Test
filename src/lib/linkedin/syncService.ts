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
  markFinished,
  recordEnrichmentResult,
  saveInventoryContact,
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

  async function runCollection(
    owner: LinkedInOwner,
    sessionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<LinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (session.status !== "awaiting_login") throw new Error("LINKEDIN_SESSION_INVALID_STATE");
    const reference = session.providerSessionReference;
    if (!reference) {
      return await repository.transitionOwnedSession(owner, sessionId, "failed", {
        failureCode: "missing_reference",
        failureMessageSafe: "LinkedIn session reference is unavailable",
      });
    }

    const handle = await provider.connect(reference);
    let destroyReference = false;
    let hasEarlyResults = false;

    const finish = async (status: FinalStatus, failureCode?: string): Promise<LinkedInSession | null> => {
      destroyReference = true;
      if (failureCode) {
        return await repository.transitionOwnedSession(owner, sessionId, status, {
          failureCode,
          failureMessageSafe: null,
        }).catch(() => repository.markFinished(owner, sessionId, status));
      }
      return repository.markFinished(owner, sessionId, status);
    };

    const pause = async (reason: string): Promise<LinkedInSession | null> => {
      if (hasEarlyResults) {
        // results_available não tem aresta para pausa: encerra parcial com o motivo registrado.
        destroyReference = true;
        return repository.transitionOwnedSession(owner, sessionId, "completed", { failureCode: reason });
      }
      const status = reason === "rate_limit" ? "paused_rate_limit" : "needs_attention";
      return repository.transitionOwnedSession(owner, sessionId, status, { failureCode: reason });
    };

    try {
      const loginDeadline = Math.min(now().getTime() + config.loginTimeoutMs, session.expiresAt.getTime());
      while (!(await readAuthentication(handle.page))) {
        if (options.signal?.aborted) return await finish("cancelled");
        if (now().getTime() >= loginDeadline) return await finish("expired");
        await delay(loginPollMs);
      }
      await handle.closeInteractiveUrl();
      if (now().getTime() >= session.expiresAt.getTime()) return await finish("expired");
      await repository.transitionOwnedSession(owner, sessionId, "authenticated");
      await repository.transitionOwnedSession(owner, sessionId, "inventorying");

      await handle.page.goto(CONNECTIONS_URL, { waitUntil: "domcontentloaded" });
      const inventory = await collectInventory(handle.page, { signal: options.signal, delayMs: config.profileDelayMinMs, now });
      if (inventory.status === "stopped") {
        if (inventory.reason === "aborted") return await finish("cancelled");
        return await pause(inventory.reason);
      }
      await persistInventory(owner, inventory.entries);
      for (let index = 0; index < inventory.entries.length; index += 1) {
        await repository.saveInventoryContact(owner, sessionId);
      }
      await repository.transitionOwnedSession(owner, sessionId, "enriching");

      const jobs = await listOpenJobs();
      const ordered = prioritizeInventory(inventory.entries, jobs);

      for (const entry of ordered) {
        const profileUrl = entry.profileUrl.value;
        if (!profileUrl) continue;
        if (options.signal?.aborted) return await finish("cancelled");
        if (now().getTime() >= session.expiresAt.getTime()) return await finish("expired");
        const spread = Math.max(0, config.profileDelayMaxMs - config.profileDelayMinMs);
        const delayMs = config.profileDelayMinMs + Math.floor(random() * (spread + 1));
        const result = await collectProfile(handle.page, profileUrl, { signal: options.signal, delayMs, now });
        if (result.status === "stopped") {
          if (result.reason === "aborted") return await finish("cancelled");
          if (result.reason === "invalid_profile_url") {
            await repository.recordEnrichmentResult(owner, sessionId, "failed");
            continue;
          }
          return await pause(result.reason);
        }
        await repository.saveProfileSnapshot(owner, snapshotInput(sessionId, profileUrl, result.profile));
        await persistProfile(owner, result.profile);
        await repository.recordEnrichmentResult(owner, sessionId, "enriched");
        if (!hasEarlyResults) {
          hasEarlyResults = true;
          await repository.transitionOwnedSession(owner, sessionId, "results_available");
        }
      }

      if (!hasEarlyResults) await repository.transitionOwnedSession(owner, sessionId, "results_available");
      return await finish("completed");
    } catch {
      destroyReference = true;
      return await repository.transitionOwnedSession(owner, sessionId, "failed", {
        failureCode: "sync_error",
        failureMessageSafe: "LinkedIn sync stopped unexpectedly",
      }).catch(() => repository.markFinished(owner, sessionId, "failed"));
    } finally {
      await handle.disconnect().catch(() => undefined);
      if (destroyReference) await provider.destroy(reference).catch(() => undefined);
    }
  }

  async function cancelOwnedSession(owner: LinkedInOwner, sessionId: string): Promise<PublicLinkedInSession | null> {
    const session = await repository.findOwnedSession(owner, sessionId);
    if (!session) return null;
    if (["completed", "cancelled", "failed", "expired"].includes(session.status)) return toPublicSession(session);
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

  return { createInteractiveSession, runCollection, cancelOwnedSession, expireOrphanedSessions };
}

export type LinkedInSyncService = ReturnType<typeof createLinkedInSyncService>;
