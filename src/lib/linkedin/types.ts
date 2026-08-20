export type LinkedInSessionStatus =
  | "preparing"
  | "awaiting_login"
  | "authenticated"
  | "inventorying"
  | "enriching"
  | "results_available"
  | "completed"
  | "needs_attention"
  | "paused_rate_limit"
  | "cancelled"
  | "failed"
  | "expired";

export type LinkedInOwner =
  | { type: "admin"; id: string; organizationId: string }
  | { type: "member"; id: string; organizationId: string };

export interface LinkedInSession {
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
  owner: LinkedInOwner;
}

export type LinkedInSessionPublicInput = Pick<
  LinkedInSession,
  | "id"
  | "status"
  | "inventoryCount"
  | "enrichedCount"
  | "failedCount"
  | "providerSessionReference"
  | "createdAt"
  | "expiresAt"
  | "failureCode"
  | "failureMessageSafe"
>;

export interface PublicLinkedInSession {
  id: string;
  status: LinkedInSessionStatus;
  inventoryCount: number;
  enrichedCount: number;
  failedCount: number;
  createdAt: Date;
  expiresAt: Date;
  failureCode: string | null;
  failureMessageSafe: string | null;
}

export interface LinkedInPublicConfig {
  enabled: boolean;
  endpoint: string;
  maxConcurrentSessions: number;
  loginTimeoutMs: number;
  reconnectTimeoutMs: number;
  sessionTimeoutMs: number;
  profileDelayMinMs: number;
  profileDelayMaxMs: number;
}

export interface LinkedInProviderConfig extends LinkedInPublicConfig {
  token: string;
}
