import { NextResponse } from "next/server";
import type { AuthenticatedActor } from "../platform/auth";
import type { LinkedInOwner, LinkedInSessionStatus } from "./types";

export const SENSITIVE_ROUTE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export const SSE_HEADERS: Record<string, string> = {
  ...SENSITIVE_ROUTE_HEADERS,
  "Content-Type": "text/event-stream",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export const TERMINAL_SESSION_STATUSES: LinkedInSessionStatus[] = ["completed", "cancelled", "failed", "expired"];

export function actorToOwner(actor: AuthenticatedActor): LinkedInOwner {
  return { type: actor.role, id: actor.ownerId, organizationId: actor.organizationId };
}

export function secureJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: SENSITIVE_ROUTE_HEADERS });
}

export function mapLinkedInServiceError(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "LINKEDIN_SYNC_DISABLED") return secureJson({ error: "sync_disabled" }, 503);
  if (code === "LINKEDIN_SYNC_CONSENT_REQUIRED") return secureJson({ error: "consent_required" }, 400);
  if (code === "LINKEDIN_SYNC_CAPACITY") return secureJson({ error: "capacity_exhausted" }, 409);
  return secureJson({ error: "linkedin_sync_failed" }, 500);
}
