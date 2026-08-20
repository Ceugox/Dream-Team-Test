import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countActiveSessions,
  createSession,
  findAllExpiredSessions,
  findOwnedSession,
  markFinished,
  recordEnrichmentResult,
  saveInventoryContact,
  saveProfileSnapshot,
  transitionOwnedSession,
  type QueryGateway,
} from "./sessionRepository";
import { encryptProviderSessionReference } from "./crypto";
import type { LinkedInOwner } from "./types";

type RecordedQuery = { text: string; values: unknown[] };

function gateway(rows: unknown[][] = []): { db: QueryGateway; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  return {
    calls,
    db: {
      query: async <T>(text: string, values: unknown[] = []) => {
        calls.push({ text, values });
        return (rows.shift() ?? []) as T[];
      },
    },
  };
}

const admin: LinkedInOwner = { type: "admin", id: "admin-1", organizationId: "org-1" };
const anotherAdmin: LinkedInOwner = { type: "admin", id: "admin-2", organizationId: "org-1" };
const member: LinkedInOwner = { type: "member", id: "member-1", organizationId: "org-1" };
const testSecret = "repository-linkedin-session-secret";
const originalSecret = process.env.APP_SECRET;

const rawStoredSession = {
  id: "session-1", status: "awaiting_login", inventoryCount: 0, enrichedCount: 0, failedCount: 0,
  providerSessionReference: encryptProviderSessionReference("stored-provider-session", testSecret), createdAt: new Date(0), expiresAt: new Date(1),
  failureCode: null, failureMessageSafe: null, ownerType: "admin", ownerId: "admin-1", organizationId: "org-1",
};

const { ownerType: _ownerType, ownerId: _ownerId, organizationId: _organizationId, ...storedSessionFields } = rawStoredSession;
const storedSession = { ...storedSessionFields, owner: admin };

describe("LinkedIn session repository", () => {
  beforeEach(() => {
    process.env.APP_SECRET = testSecret;
  });

  afterEach(() => {
    process.env.APP_SECRET = originalSecret;
  });

  it("finds an admin's own session", async () => {
    const { db } = gateway([[rawStoredSession]]);

    await expect(findOwnedSession(admin, "session-1", db)).resolves.toEqual(storedSession);
  });

  it.each([
    [{ ...rawStoredSession, ownerType: "operator" }],
    [{ ...rawStoredSession, ownerId: "" }],
    [{ ...rawStoredSession, organizationId: undefined }],
  ])("rejects a persisted session with an invalid owner", async (row) => {
    const { db } = gateway([[row]]);

    await expect(findOwnedSession(admin, "session-1", db)).rejects.toThrow("INVALID_LINKEDIN_SESSION_OWNER");
  });

  it("rejects a prefix-valid raw provider token persisted as an envelope", async () => {
    const rawTokenEnvelope = `enc:v1:${Buffer.from("token=raw-provider-cookie", "utf8").toString("base64url")}`;
    const { db } = gateway([[{ ...rawStoredSession, providerSessionReference: rawTokenEnvelope }]]);

    await expect(findOwnedSession(admin, "session-1", db)).rejects.toThrow("INVALID_ENCRYPTED_PROVIDER_SESSION_REFERENCE");
  });

  it("does not return a session to another admin in the same organization", async () => {
    const { db, calls } = gateway([[]]);

    await expect(findOwnedSession(anotherAdmin, "session-1", db)).resolves.toBeNull();
    expect(calls[0].values).toEqual(["session-1", "admin", "admin-2", "org-1"]);
  });

  it("does not return an admin session to a member", async () => {
    const { db, calls } = gateway([[]]);

    await expect(findOwnedSession(member, "session-1", db)).resolves.toBeNull();
    expect(calls[0].values).toEqual(["session-1", "member", "member-1", "org-1"]);
  });

  it("transitions only through the complete owner predicate", async () => {
    const { db, calls } = gateway([[rawStoredSession], [{ ...rawStoredSession, status: "authenticated" }]]);

    await transitionOwnedSession(admin, "session-1", "authenticated", {}, db);

    expect(calls[1].text).toContain("WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4");
    expect(calls[1].values.slice(0, 4)).toEqual(["session-1", "admin", "admin-1", "org-1"]);
  });

  it.each([
    ["completed", "results_available"],
    ["cancelled", "awaiting_login"],
    ["failed", "awaiting_login"],
    ["expired", "awaiting_login"],
  ] as const)("clears the provider reference when transitioned to %s", async (status, initialStatus) => {
    const { db, calls } = gateway([[{ ...rawStoredSession, status: initialStatus }], [{ ...rawStoredSession, status, providerSessionReference: null }]]);

    await transitionOwnedSession(admin, "session-1", status, {}, db);

    expect(calls[1].text).toContain("provider_session_reference=NULL");
  });

  it("clears the provider reference when a session is finalized", async () => {
    const { db, calls } = gateway([[{ ...rawStoredSession, status: "completed", providerSessionReference: null }]]);

    await markFinished(admin, "session-1", "completed", db);

    expect(calls[0].text).toContain("provider_session_reference=NULL");
    expect(calls[0].values).toEqual(["session-1", "admin", "admin-1", "org-1", "completed"]);
  });

  it("increments inventory counters atomically", async () => {
    const { db, calls } = gateway([[{ ...rawStoredSession, inventoryCount: 1 }]]);

    await saveInventoryContact(admin, "session-1", db);

    expect(calls[0].text).toContain("inventory_count=inventory_count+1");
    expect(calls[0].text).toContain("WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4");
  });

  it("upserts snapshots incrementally with a new schema version", async () => {
    const { db, calls } = gateway([[{ id: "snapshot-1", schemaVersion: 2 }]]);

    await saveProfileSnapshot(admin, {
      sessionId: "session-1",
      linkedinUrl: "https://www.linkedin.com/in/example",
      professionalData: { headline: "Engineer", skills: ["TypeScript"] },
      sourceUrl: "https://www.linkedin.com/in/example",
      observedAt: new Date(0),
      extractionConfidence: 0.9,
      schemaVersion: 2,
    }, db);

    expect(calls[0].text).toContain("ON CONFLICT (owner_type,owner_id,organization_id,linkedin_url) DO UPDATE");
    expect(calls[0].text).toContain("schema_version=GREATEST");
    expect(calls[0].values).toContain("org-1");
  });

  it("rejects credentials and provider session data from professional snapshots", async () => {
    const { db } = gateway();

    await expect(saveProfileSnapshot(admin, {
      sessionId: "session-1",
      linkedinUrl: "https://www.linkedin.com/in/example",
      professionalData: { headline: "Engineer", providerSessionReference: "secret" },
      sourceUrl: "https://www.linkedin.com/in/example",
      observedAt: new Date(0),
      extractionConfidence: 0.9,
      schemaVersion: 1,
    }, db)).rejects.toThrow("UNSAFE_PROFILE_SNAPSHOT");
  });

  it("accepts only versioned encrypted provider references when creating a session", async () => {
    const { db, calls } = gateway([[rawStoredSession]]);
    const reference = encryptProviderSessionReference("provider-session-to-persist", testSecret);

    await createSession(admin, { expiresAt: new Date(1), providerSessionReference: reference }, db);

    expect(calls[0].values).toContain(reference);
  });

  it("rejects a prefix-valid raw provider token at runtime when creating a session", async () => {
    const { db } = gateway([[rawStoredSession]]);
    const rawTokenEnvelope = `enc:v1:${Buffer.from("token=raw-provider-cookie", "utf8").toString("base64url")}`;

    await expect(createSession(admin, {
      expiresAt: new Date(1),
      providerSessionReference: rawTokenEnvelope as never,
    }, db)).rejects.toThrow("INVALID_ENCRYPTED_PROVIDER_SESSION_REFERENCE");
  });

  it("counts active sessions across all owners for the global capacity limit", async () => {
    const { db, calls } = gateway([[{ count: "2" }]]);

    await expect(countActiveSessions(db)).resolves.toBe(2);
    expect(calls[0].text).toMatch(/NOT IN \('completed','cancelled','failed','expired'\)/);
    expect(calls[0].values).toEqual([]);
  });

  it("increments enrichment counters atomically scoped to the owner", async () => {
    const enriched = gateway([[rawStoredSession]]);
    await recordEnrichmentResult(admin, "session-1", "enriched", enriched.db);
    expect(enriched.calls[0].text).toMatch(/enriched_count=enriched_count\+1/);
    expect(enriched.calls[0].values).toEqual(["session-1", "admin", "admin-1", "org-1"]);

    const failed = gateway([[rawStoredSession]]);
    await recordEnrichmentResult(admin, "session-1", "failed", failed.db);
    expect(failed.calls[0].text).toMatch(/failed_count=failed_count\+1/);
  });

  it("finds expired sessions of every owner for the watchdog", async () => {
    const { db, calls } = gateway([[rawStoredSession]]);

    const sessions = await findAllExpiredSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].owner).toEqual(admin);
    expect(calls[0].text).toMatch(/expires_at <= now\(\)/);
    expect(calls[0].values).toEqual([]);
  });
});
