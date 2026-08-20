import { query as databaseQuery } from "../platform/db";
import { canTransition } from "./sessionState";
import type { LinkedInOwner, LinkedInSession, LinkedInSessionStatus } from "./types";

export interface QueryGateway {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
}

const database: QueryGateway = {
  query: async <T>(text: string, values: unknown[] = []) => databaseQuery<T & Record<string, unknown>>(text, values),
};

type StoredSession = {
  id: string;
  status: LinkedInSessionStatus;
  inventoryCount: number;
  enrichedCount: number;
  failedCount: number;
  providerSessionReference: string | null;
  createdAt: Date;
  expiresAt: Date;
  failureCode: string | null;
  failureMessageSafe: string | null;
  owner?: LinkedInOwner;
  ownerType?: LinkedInOwner["type"];
  ownerId?: string;
  organizationId?: string;
};

const sessionFields = `id,status,
  inventory_count AS "inventoryCount",enriched_count AS "enrichedCount",failed_count AS "failedCount",
  provider_session_reference AS "providerSessionReference",created_at AS "createdAt",expires_at AS "expiresAt",
  failure_code AS "failureCode",failure_message_safe AS "failureMessageSafe",
  owner_type AS "ownerType",owner_id AS "ownerId",organization_id AS "organizationId"`;

function ownerValues(owner: LinkedInOwner): [LinkedInOwner["type"], string, string] {
  return [owner.type, owner.id, owner.organizationId];
}

function toSession(row: StoredSession): LinkedInSession {
  if (row.owner) return row as LinkedInSession;
  return {
    id: row.id,
    status: row.status,
    inventoryCount: row.inventoryCount,
    enrichedCount: row.enrichedCount,
    failedCount: row.failedCount,
    providerSessionReference: row.providerSessionReference,
    createdAt: new Date(row.createdAt),
    expiresAt: new Date(row.expiresAt),
    failureCode: row.failureCode,
    failureMessageSafe: row.failureMessageSafe,
    owner: {
      type: row.ownerType!,
      id: row.ownerId!,
      organizationId: row.organizationId!,
    },
  };
}

function isFinalStatus(status: LinkedInSessionStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "failed" || status === "expired";
}

function assertSafeText(value: string | null | undefined, label: string): void {
  if (!value) return;
  if (/\b(cookie|credential|password|token|authorization|provider[_ -]?session)\b/i.test(value) || /<\/?(?:html|body|script)\b/i.test(value)) {
    throw new Error(`UNSAFE_${label}`);
  }
}

function assertSafeProfessionalData(value: unknown): void {
  if (typeof value === "string") {
    assertSafeText(value, "PROFILE_SNAPSHOT");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertSafeProfessionalData);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (/(cookie|credential|password|token|authorization|provider[_ -]?session|html)/i.test(key)) {
      throw new Error("UNSAFE_PROFILE_SNAPSHOT");
    }
    assertSafeProfessionalData(nested);
  }
}

export async function createSession(
  owner: LinkedInOwner,
  input: {
    expiresAt: Date;
    providerSessionReference?: string | null;
    consentedAt?: Date | null;
    consentVersion?: string | null;
    status?: LinkedInSessionStatus;
  },
  db: QueryGateway = database,
): Promise<LinkedInSession> {
  const rows = await db.query<StoredSession>(`INSERT INTO linkedin_sync_sessions
    (owner_type,owner_id,organization_id,status,provider_session_reference,consented_at,consent_version,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING ${sessionFields}`,
  [...ownerValues(owner), input.status ?? "preparing", input.providerSessionReference ?? null,
    input.consentedAt ?? null, input.consentVersion ?? null, input.expiresAt]);
  return toSession(rows[0]);
}

export async function findOwnedSession(
  owner: LinkedInOwner,
  id: string,
  db: QueryGateway = database,
): Promise<LinkedInSession | null> {
  const rows = await db.query<StoredSession>(`SELECT ${sessionFields} FROM linkedin_sync_sessions
    WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4`, [id, ...ownerValues(owner)]);
  return rows[0] ? toSession(rows[0]) : null;
}

export async function transitionOwnedSession(
  owner: LinkedInOwner,
  id: string,
  status: LinkedInSessionStatus,
  changes: { failureCode?: string | null; failureMessageSafe?: string | null } = {},
  db: QueryGateway = database,
): Promise<LinkedInSession | null> {
  const existing = await findOwnedSession(owner, id, db);
  if (!existing) return null;
  if (!canTransition(existing.status, status)) throw new Error("INVALID_LINKEDIN_SESSION_TRANSITION");
  assertSafeText(changes.failureMessageSafe, "FAILURE_MESSAGE");
  const rows = await db.query<StoredSession>(`UPDATE linkedin_sync_sessions SET
    status=$5,
    failure_code=CASE WHEN $6 THEN $7 ELSE failure_code END,
    failure_message_safe=CASE WHEN $8 THEN $9 ELSE failure_message_safe END,
    updated_at=now(),version=version+1
    WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4
    RETURNING ${sessionFields}`,
  [id, ...ownerValues(owner), status,
    Object.hasOwn(changes, "failureCode"), changes.failureCode ?? null,
    Object.hasOwn(changes, "failureMessageSafe"), changes.failureMessageSafe ?? null]);
  return rows[0] ? toSession(rows[0]) : null;
}

export async function listActiveSessions(owner: LinkedInOwner, db: QueryGateway = database): Promise<LinkedInSession[]> {
  const rows = await db.query<StoredSession>(`SELECT ${sessionFields} FROM linkedin_sync_sessions
    WHERE owner_type=$1 AND owner_id=$2 AND organization_id=$3
      AND status NOT IN ('completed','cancelled','failed','expired')
    ORDER BY created_at DESC`, ownerValues(owner));
  return rows.map(toSession);
}

export async function saveInventoryContact(
  owner: LinkedInOwner,
  sessionId: string,
  db: QueryGateway = database,
): Promise<LinkedInSession | null> {
  const rows = await db.query<StoredSession>(`UPDATE linkedin_sync_sessions SET
    inventory_count=inventory_count+1,updated_at=now(),version=version+1
    WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4
    RETURNING ${sessionFields}`, [sessionId, ...ownerValues(owner)]);
  return rows[0] ? toSession(rows[0]) : null;
}

export type ProfileSnapshotInput = {
  sessionId: string;
  linkedinUrl: string;
  schemaVersion: number;
  professionalData: Record<string, unknown>;
  sourceUrl: string;
  observedAt: Date;
  extractionConfidence: number;
};

export async function saveProfileSnapshot(
  owner: LinkedInOwner,
  input: ProfileSnapshotInput,
  db: QueryGateway = database,
): Promise<{ id: string; schemaVersion: number } | null> {
  assertSafeProfessionalData(input.professionalData);
  assertSafeText(input.sourceUrl, "PROFILE_SNAPSHOT");
  const rows = await db.query<{ id: string; schemaVersion: number }>(`INSERT INTO linkedin_profile_snapshots
    (session_id,owner_type,owner_id,organization_id,linkedin_url,schema_version,professional_data,source_url,observed_at,extraction_confidence)
    SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10
    WHERE EXISTS (SELECT 1 FROM linkedin_sync_sessions
      WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4)
    ON CONFLICT (owner_type,owner_id,organization_id,linkedin_url) DO UPDATE SET
      session_id=excluded.session_id,
      schema_version=GREATEST(linkedin_profile_snapshots.schema_version,excluded.schema_version),
      professional_data=linkedin_profile_snapshots.professional_data || excluded.professional_data,
      source_url=excluded.source_url,
      observed_at=GREATEST(linkedin_profile_snapshots.observed_at,excluded.observed_at),
      extraction_confidence=GREATEST(linkedin_profile_snapshots.extraction_confidence,excluded.extraction_confidence),
      updated_at=now()
    RETURNING id,schema_version AS "schemaVersion"`,
  [input.sessionId, ...ownerValues(owner), input.linkedinUrl, input.schemaVersion,
    JSON.stringify(input.professionalData), input.sourceUrl, input.observedAt, input.extractionConfidence]);
  return rows[0] ?? null;
}

export async function markFinished(
  owner: LinkedInOwner,
  id: string,
  status: Extract<LinkedInSessionStatus, "completed" | "cancelled" | "failed" | "expired">,
  db: QueryGateway = database,
): Promise<LinkedInSession | null> {
  if (!isFinalStatus(status)) throw new Error("LINKEDIN_SESSION_NOT_FINAL");
  const rows = await db.query<StoredSession>(`UPDATE linkedin_sync_sessions SET
    status=$5,provider_session_reference=NULL,updated_at=now(),version=version+1
    WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND organization_id=$4
    RETURNING ${sessionFields}`, [id, ...ownerValues(owner), status]);
  return rows[0] ? toSession(rows[0]) : null;
}

export async function findExpiredSessions(owner: LinkedInOwner, db: QueryGateway = database): Promise<LinkedInSession[]> {
  const rows = await db.query<StoredSession>(`SELECT ${sessionFields} FROM linkedin_sync_sessions
    WHERE owner_type=$1 AND owner_id=$2 AND organization_id=$3
      AND expires_at <= now() AND status NOT IN ('completed','cancelled','failed','expired')
    ORDER BY expires_at ASC`, ownerValues(owner));
  return rows.map(toSession);
}
