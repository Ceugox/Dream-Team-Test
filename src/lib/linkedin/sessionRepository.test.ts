import { describe, expect, it } from "vitest";
import {
  findOwnedSession,
  markFinished,
  saveInventoryContact,
  saveProfileSnapshot,
  transitionOwnedSession,
  type QueryGateway,
} from "./sessionRepository";
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

const storedSession = {
  id: "session-1", status: "awaiting_login", inventoryCount: 0, enrichedCount: 0, failedCount: 0,
  providerSessionReference: "encrypted-reference", createdAt: new Date(0), expiresAt: new Date(1),
  failureCode: null, failureMessageSafe: null, owner: admin,
};

describe("LinkedIn session repository", () => {
  it("finds an admin's own session", async () => {
    const { db } = gateway([[storedSession]]);

    await expect(findOwnedSession(admin, "session-1", db)).resolves.toEqual(storedSession);
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
    const { db, calls } = gateway([[storedSession], [{ ...storedSession, status: "authenticated" }]]);

    await transitionOwnedSession(admin, "session-1", "authenticated", {}, db);

    expect(calls[1].text).toContain("WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4");
    expect(calls[1].values.slice(0, 4)).toEqual(["session-1", "admin", "admin-1", "org-1"]);
  });

  it("clears the provider reference when a session is finalized", async () => {
    const { db, calls } = gateway([[{ ...storedSession, status: "completed", providerSessionReference: null }]]);

    await markFinished(admin, "session-1", "completed", db);

    expect(calls[0].text).toContain("provider_session_reference=NULL");
    expect(calls[0].values).toEqual(["session-1", "admin", "admin-1", "org-1", "completed"]);
  });

  it("increments inventory counters atomically", async () => {
    const { db, calls } = gateway([[{ ...storedSession, inventoryCount: 1 }]]);

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
});
