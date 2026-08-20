import { createHash } from "node:crypto";
import type { LinkedInOwner } from "../linkedin/types";

export type LinkedInQueueTaskType = "linkedin_inventory" | "linkedin_profile_collect" | "linkedin_finalize";

export interface LinkedInTaskSpec {
  taskType: LinkedInQueueTaskType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  timeoutSeconds: number;
  tokenBudget: number;
  priority: number;
}

export function linkedinProfileUrlHash(profileUrl: string): string {
  return createHash("sha256").update(profileUrl).digest("hex").slice(0, 16);
}

export function linkedinIdempotencyKey(sessionId: string, kind: "inventory" | "finalize"): string {
  return `linkedin:${sessionId}:${kind}`;
}

export function linkedinProfileIdempotencyKey(sessionId: string, profileUrl: string): string {
  return `linkedin:${sessionId}:profile:${linkedinProfileUrlHash(profileUrl)}`;
}

export function buildInventoryTaskSpec(sessionId: string, owner: LinkedInOwner, loginTimeoutMs: number): LinkedInTaskSpec {
  return {
    taskType: "linkedin_inventory",
    idempotencyKey: linkedinIdempotencyKey(sessionId, "inventory"),
    payload: { sessionId, owner },
    timeoutSeconds: Math.min(3600, Math.ceil(loginTimeoutMs / 1000) + 300),
    tokenBudget: 1,
    priority: 40,
  };
}

export function buildLinkedInProfilePlan(sessionId: string, owner: LinkedInOwner, profileUrls: string[]): {
  profiles: LinkedInTaskSpec[];
  finalize: LinkedInTaskSpec;
} {
  const seen = new Set<string>();
  const profiles: LinkedInTaskSpec[] = [];
  for (const profileUrl of profileUrls) {
    const idempotencyKey = linkedinProfileIdempotencyKey(sessionId, profileUrl);
    if (seen.has(idempotencyKey)) continue;
    seen.add(idempotencyKey);
    profiles.push({
      taskType: "linkedin_profile_collect",
      idempotencyKey,
      payload: { sessionId, owner, profileUrl },
      timeoutSeconds: 180,
      tokenBudget: 1,
      priority: 60,
    });
  }
  return {
    profiles,
    finalize: {
      taskType: "linkedin_finalize",
      idempotencyKey: linkedinIdempotencyKey(sessionId, "finalize"),
      payload: { sessionId, owner },
      timeoutSeconds: 60,
      tokenBudget: 1,
      priority: 90,
    },
  };
}
