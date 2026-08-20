import type {
  LinkedInSessionPublicInput,
  LinkedInSessionStatus,
  PublicLinkedInSession,
} from "./types";

const transitions: Record<LinkedInSessionStatus, LinkedInSessionStatus[]> = {
  preparing: ["awaiting_login", "cancelled", "failed", "expired"],
  awaiting_login: ["authenticated", "needs_attention", "cancelled", "failed", "expired"],
  authenticated: ["inventorying", "cancelled", "failed", "expired"],
  inventorying: ["enriching", "needs_attention", "paused_rate_limit", "cancelled", "failed", "expired"],
  enriching: ["results_available", "needs_attention", "paused_rate_limit", "cancelled", "failed", "expired"],
  results_available: ["completed", "cancelled", "failed", "expired"],
  completed: [],
  needs_attention: ["awaiting_login", "inventorying", "enriching", "cancelled", "failed", "expired"],
  paused_rate_limit: ["inventorying", "enriching", "cancelled", "failed", "expired"],
  cancelled: [],
  failed: [],
  expired: [],
};

export function canTransition(from: LinkedInSessionStatus, to: LinkedInSessionStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function toPublicSession(session: LinkedInSessionPublicInput): PublicLinkedInSession {
  return {
    id: session.id,
    status: session.status,
    inventoryCount: session.inventoryCount,
    enrichedCount: session.enrichedCount,
    failedCount: session.failedCount,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    failureCode: session.failureCode,
    failureMessageSafe: session.failureMessageSafe,
  };
}
