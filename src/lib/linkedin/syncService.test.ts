import { describe, expect, it, vi } from "vitest";
import { createLinkedInSyncService, isAuthenticatedSignal, type SyncRepository } from "./syncService";
import { canTransition } from "./sessionState";
import { LINKEDIN_SELECTOR_VERSION, type InventoryEntry, type ObservedField, type ProfessionalProfile } from "./collectors/schemas";
import type { LinkedInBrowserProvider, RemoteBrowserHandle } from "./providers/types";
import type { LinkedInOwner, LinkedInProviderConfig, LinkedInSession, LinkedInSessionStatus } from "./types";

const admin: LinkedInOwner = { type: "admin", id: "admin-1", organizationId: "org-1" };
const observedAt = "2026-08-20T12:00:00.000Z";

const config: LinkedInProviderConfig = {
  enabled: true,
  endpoint: "https://production-sfo.browserless.io",
  token: "provider-secret",
  maxConcurrentSessions: 2,
  loginTimeoutMs: 600000,
  reconnectTimeoutMs: 30000,
  sessionTimeoutMs: 2700000,
  profileDelayMinMs: 0,
  profileDelayMaxMs: 0,
};

function field(value: string | null): ObservedField<string> {
  return { value, sourceUrl: "https://www.linkedin.com/mynetwork/invite-connect/connections/", observedAt, confidence: 0.95 };
}

function inventoryEntry(url: string, headline: string | null = null): InventoryEntry {
  return {
    selectorVersion: LINKEDIN_SELECTOR_VERSION,
    profileUrl: field(url),
    name: field(null),
    headline: field(headline),
    photoUrl: field(null),
    location: field(null),
    connectionDegree: field(null),
  };
}

function professionalProfile(url: string): ProfessionalProfile {
  const empty = <T,>(): ObservedField<T> => ({ value: null, sourceUrl: url, observedAt, confidence: 0.95 });
  return {
    selectorVersion: LINKEDIN_SELECTOR_VERSION,
    profileUrl: { value: url, sourceUrl: url, observedAt, confidence: 0.95 },
    name: { value: "Ada Example", sourceUrl: url, observedAt, confidence: 0.95 },
    headline: empty(), location: empty(), summary: empty(),
    roles: empty(), education: empty(), skills: empty(), certifications: empty(),
    languages: empty(), projects: empty(), internationalExperience: empty(), mutualConnections: empty(),
  };
}

const finalStatuses: LinkedInSessionStatus[] = ["completed", "cancelled", "failed", "expired"];

function fakeRepository() {
  let counter = 0;
  const sessions = new Map<string, LinkedInSession>();
  const snapshots: Array<{ linkedinUrl: string }> = [];
  const transitionLog: LinkedInSessionStatus[] = [];
  const finish = (session: LinkedInSession, status: LinkedInSessionStatus) => {
    session.status = status;
    if (finalStatuses.includes(status)) session.providerSessionReference = null;
  };
  const active = () => [...sessions.values()].filter((session) => !finalStatuses.includes(session.status)).length;
  const repository: SyncRepository = {
    createSessionWithCapacity: async (owner, input, maxActiveSessions) => {
      if (active() >= maxActiveSessions) return null;
      counter += 1;
      const session: LinkedInSession = {
        id: `session-${counter}`, status: input.status ?? "preparing",
        inventoryCount: 0, enrichedCount: 0, failedCount: 0,
        providerSessionReference: input.providerSessionReference ?? null,
        createdAt: new Date(0), expiresAt: input.expiresAt,
        failureCode: null, failureMessageSafe: null, owner,
      };
      sessions.set(session.id, session);
      return { ...session };
    },
    findOwnedSession: async (owner, id) => {
      const session = sessions.get(id);
      return session && session.owner.type === owner.type && session.owner.id === owner.id ? { ...session } : null;
    },
    transitionOwnedSession: async (_owner, id, status, changes = {}) => {
      const session = sessions.get(id);
      if (!session) return null;
      if (!canTransition(session.status, status)) throw new Error("INVALID_LINKEDIN_SESSION_TRANSITION");
      transitionLog.push(status);
      finish(session, status);
      if (Object.hasOwn(changes, "failureCode")) session.failureCode = changes.failureCode ?? null;
      if (Object.hasOwn(changes, "failureMessageSafe")) session.failureMessageSafe = changes.failureMessageSafe ?? null;
      return { ...session };
    },
    countActiveSessions: async () => active(),
    saveInventoryContact: async (_owner, id) => {
      const session = sessions.get(id);
      if (!session) return null;
      session.inventoryCount += 1;
      return { ...session };
    },
    saveProfileSnapshot: async (_owner, input) => {
      snapshots.push({ linkedinUrl: input.linkedinUrl });
      return { id: `snapshot-${snapshots.length}`, schemaVersion: input.schemaVersion };
    },
    recordEnrichmentResult: async (_owner, id, outcome) => {
      const session = sessions.get(id);
      if (!session) return null;
      if (outcome === "enriched") session.enrichedCount += 1;
      else session.failedCount += 1;
      return { ...session };
    },
    markFinished: async (_owner, id, status) => {
      const session = sessions.get(id);
      if (!session) return null;
      if (finalStatuses.includes(session.status)) return { ...session };
      transitionLog.push(status);
      finish(session, status);
      return { ...session };
    },
    findAllExpiredSessions: async () => [...sessions.values()]
      .filter((session) => !finalStatuses.includes(session.status) && session.expiresAt.getTime() <= 0)
      .map((session) => ({ ...session })),
  };
  return { repository, sessions, snapshots, transitionLog };
}

function fakeProvider() {
  const destroyed: string[] = [];
  const page = {
    url: () => "https://www.linkedin.com/feed/",
    goto: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({})) as never,
  };
  const handle: RemoteBrowserHandle = {
    page,
    closeInteractiveUrl: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
  const provider: LinkedInBrowserProvider = {
    createSession: vi.fn(async () => ({ encryptedReferencePayload: "enc:v1:reference", interactiveUrl: "https://live.browserless.example/session" })),
    connect: vi.fn(async () => handle),
    destroy: vi.fn(async (reference: string) => { destroyed.push(reference); }),
  };
  return { provider, handle, page, destroyed };
}

interface HarnessOverrides {
  config?: Partial<LinkedInProviderConfig>;
  collectInventory?: Parameters<typeof createLinkedInSyncService>[0]["collectInventory"];
  collectProfile?: Parameters<typeof createLinkedInSyncService>[0]["collectProfile"];
  readAuthentication?: Parameters<typeof createLinkedInSyncService>[0]["readAuthentication"];
  now?: () => Date;
}

function harness(overrides: HarnessOverrides = {}) {
  const events: string[] = [];
  const repo = fakeRepository();
  const browser = fakeProvider();
  const entries = [
    inventoryEntry("https://www.linkedin.com/in/ada-example", "Payments partnerships"),
    inventoryEntry("https://www.linkedin.com/in/ben-example", "Engineer"),
  ];
  const service = createLinkedInSyncService({
    config: { ...config, ...overrides.config },
    provider: browser.provider,
    repository: repo.repository,
    collectInventory: overrides.collectInventory ?? (async () => {
      events.push("inventory-collected");
      return { status: "complete", entries };
    }),
    collectProfile: overrides.collectProfile ?? (async (_page, url) => {
      events.push(`profile:${url}`);
      return { status: "complete", profile: professionalProfile(url) };
    }),
    readAuthentication: overrides.readAuthentication ?? (async () => true),
    listOpenJobs: async () => [],
    persistInventory: async () => { events.push("inventory-persisted"); },
    persistProfile: async (_owner, profile) => { events.push(`persisted:${profile.profileUrl.value}`); },
    now: overrides.now ?? (() => new Date(1000)),
    delay: async () => undefined,
    random: () => 0,
    loginPollMs: 0,
  });
  return { service, events, entries, ...repo, ...browser };
}

async function createAndRun(context: ReturnType<typeof harness>, options: { signal?: AbortSignal } = {}) {
  const created = await context.service.createInteractiveSession(admin, { consent: true });
  const result = await context.service.runCollection(admin, created.session.id, options);
  return { created, result };
}

describe("isAuthenticatedSignal", () => {
  it("recognizes an authenticated LinkedIn page by URL and navigation only", () => {
    expect(isAuthenticatedSignal({ url: "https://www.linkedin.com/feed/", hasNavigation: true })).toBe(true);
    expect(isAuthenticatedSignal({ url: "https://www.linkedin.com/login", hasNavigation: true })).toBe(false);
    expect(isAuthenticatedSignal({ url: "https://www.linkedin.com/checkpoint/challenge", hasNavigation: true })).toBe(false);
    expect(isAuthenticatedSignal({ url: "https://www.linkedin.com/feed/", hasNavigation: false })).toBe(false);
  });
});

describe("LinkedIn sync service", () => {
  it("refuses to create sessions when the integration is disabled", async () => {
    const context = harness({ config: { enabled: false } });
    await expect(context.service.createInteractiveSession(admin, { consent: true })).rejects.toThrow("LINKEDIN_SYNC_DISABLED");
    expect(context.provider.createSession).not.toHaveBeenCalled();
  });

  it("requires explicit consent", async () => {
    const context = harness();
    await expect(context.service.createInteractiveSession(admin, { consent: false })).rejects.toThrow("LINKEDIN_SYNC_CONSENT_REQUIRED");
  });

  it("enforces the global limit of concurrent sessions before touching the provider", async () => {
    const context = harness();
    await context.service.createInteractiveSession(admin, { consent: true });
    await context.service.createInteractiveSession(admin, { consent: true });
    await expect(context.service.createInteractiveSession(admin, { consent: true })).rejects.toThrow("LINKEDIN_SYNC_CAPACITY");
    expect(context.provider.createSession).toHaveBeenCalledTimes(2);
  });

  it("returns an awaiting_login session without exposing the provider reference", async () => {
    const context = harness();
    const created = await context.service.createInteractiveSession(admin, { consent: true });
    expect(created.session.status).toBe("awaiting_login");
    expect(created.interactiveUrl).toBe("https://live.browserless.example/session");
    expect(JSON.stringify(created)).not.toContain("enc:v1:reference");
  });

  it("closes the interactive view once login is detected and saves inventory before any profile", async () => {
    let checks = 0;
    const context = harness({ readAuthentication: async () => { checks += 1; return checks >= 3; } });
    const { result } = await createAndRun(context);
    expect(result?.status).toBe("completed");
    expect(context.handle.closeInteractiveUrl).toHaveBeenCalledTimes(1);
    const inventoryIndex = context.events.indexOf("inventory-persisted");
    const firstProfileIndex = context.events.findIndex((event) => event.startsWith("profile:"));
    expect(inventoryIndex).toBeGreaterThanOrEqual(0);
    expect(inventoryIndex).toBeLessThan(firstProfileIndex);
  });

  it("exposes first results right after the first snapshot", async () => {
    const seen: LinkedInSessionStatus[] = [];
    const context = harness({
      collectProfile: async (_page, url) => {
        seen.push([...context.sessions.values()][0].status);
        return { status: "complete", profile: professionalProfile(url) };
      },
    });
    await createAndRun(context);
    expect(seen[0]).toBe("enriching");
    expect(seen[1]).toBe("results_available");
  });

  it("completes, records counters and destroys the provider session at the end", async () => {
    const context = harness();
    const { created, result } = await createAndRun(context);
    expect(result?.status).toBe("completed");
    expect(result?.enrichedCount).toBe(2);
    expect(result?.inventoryCount).toBe(2);
    expect(context.destroyed).toEqual(["enc:v1:reference"]);
    expect(context.sessions.get(created.session.id)?.providerSessionReference).toBeNull();
    expect(context.handle.disconnect).toHaveBeenCalled();
  });

  it("cancels and destroys the provider session when aborted mid-enrichment", async () => {
    const controller = new AbortController();
    const context = harness({
      collectProfile: async () => {
        controller.abort();
        return { status: "stopped", reason: "aborted" };
      },
    });
    const { created, result } = await createAndRun(context, { signal: controller.signal });
    expect(result?.status).toBe("cancelled");
    expect(context.destroyed).toEqual(["enc:v1:reference"]);
    expect(context.sessions.get(created.session.id)?.providerSessionReference).toBeNull();
  });

  it("expires and destroys the session when the deadline passes between profiles", async () => {
    let clock = 1000;
    const context = harness({
      now: () => new Date(clock),
      collectProfile: async (_page, url) => {
        clock += config.sessionTimeoutMs + 1;
        return { status: "complete", profile: professionalProfile(url) };
      },
    });
    const { result } = await createAndRun(context);
    expect(result?.status).toBe("expired");
    expect(context.destroyed).toEqual(["enc:v1:reference"]);
  });

  it("pauses on checkpoint without retrying and keeps the provider session alive", async () => {
    const collectProfile = vi.fn(async () => ({ status: "stopped", reason: "checkpoint" } as const));
    const context = harness({ collectProfile });
    const { result } = await createAndRun(context);
    expect(result?.status).toBe("needs_attention");
    expect(result?.failureCode).toBe("checkpoint");
    expect(collectProfile).toHaveBeenCalledTimes(1);
    expect(context.destroyed).toEqual([]);
    expect(context.handle.disconnect).toHaveBeenCalled();
  });

  it("pauses on rate limit during inventory", async () => {
    const context = harness({ collectInventory: async () => ({ status: "stopped", reason: "rate_limit" }) });
    const { result } = await createAndRun(context);
    expect(result?.status).toBe("paused_rate_limit");
    expect(context.destroyed).toEqual([]);
  });

  it("preserves persisted results when a crash happens after three profiles", async () => {
    let calls = 0;
    const entries = [1, 2, 3, 4].map((index) => inventoryEntry(`https://www.linkedin.com/in/person-${index}`));
    const context = harness({
      collectInventory: async () => ({ status: "complete", entries }),
      collectProfile: async (_page, url) => {
        calls += 1;
        if (calls > 3) throw new Error("browser crashed");
        return { status: "complete", profile: professionalProfile(url) };
      },
    });
    const { created, result } = await createAndRun(context);
    expect(result?.status).toBe("failed");
    expect(context.snapshots).toHaveLength(3);
    expect(context.sessions.get(created.session.id)?.enrichedCount).toBe(3);
    expect(context.destroyed).toEqual(["enc:v1:reference"]);
    expect(JSON.stringify(context.sessions.get(created.session.id))).not.toContain("browser crashed");
  });

  it("counts an invalid profile URL as a failure and keeps going", async () => {
    const entries = [inventoryEntry("https://www.linkedin.com/in/valid-person")];
    entries[0].profileUrl = field("https://www.linkedin.com/in/valid-person");
    const context = harness({
      collectInventory: async () => ({ status: "complete", entries }),
      collectProfile: async () => ({ status: "stopped", reason: "invalid_profile_url" }),
    });
    const { created, result } = await createAndRun(context);
    expect(result?.status).toBe("completed");
    expect(context.sessions.get(created.session.id)?.failedCount).toBe(1);
  });

  it("keeps a session cancelled when the cancel races the login polling", async () => {
    const context = harness({
      readAuthentication: async () => {
        await context.service.cancelOwnedSession(admin, [...context.sessions.keys()][0]);
        return true;
      },
    });
    const created = await context.service.createInteractiveSession(admin, { consent: true });
    const result = await context.service.runCollection(admin, created.session.id);
    expect(result?.status).toBe("cancelled");
    expect(context.sessions.get(created.session.id)?.status).toBe("cancelled");
    expect(context.sessions.get(created.session.id)?.providerSessionReference).toBeNull();
  });

  it("cancels an owned session idempotently and destroys its reference", async () => {
    const context = harness();
    const created = await context.service.createInteractiveSession(admin, { consent: true });
    const first = await context.service.cancelOwnedSession(admin, created.session.id);
    const second = await context.service.cancelOwnedSession(admin, created.session.id);
    expect(first?.status).toBe("cancelled");
    expect(second?.status).toBe("cancelled");
    expect(context.destroyed).toEqual(["enc:v1:reference"]);
    expect(await context.service.cancelOwnedSession(admin, "missing")).toBeNull();
  });

  it("expires orphaned sessions of every owner", async () => {
    const context = harness();
    await context.repository.createSessionWithCapacity(admin, { expiresAt: new Date(0), providerSessionReference: "enc:v1:orphan" as never, status: "awaiting_login" }, 2);
    const expired = await context.service.expireOrphanedSessions();
    expect(expired).toBe(1);
    expect([...context.sessions.values()][0].status).toBe("expired");
    expect(context.destroyed).toEqual(["enc:v1:orphan"]);
  });
});
