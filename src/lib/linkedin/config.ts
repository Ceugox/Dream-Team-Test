import { z } from "zod";
import type { LinkedInProviderConfig } from "./types";

const environmentSchema = z.object({
  LINKEDIN_REMOTE_SYNC_ENABLED: z.enum(["true", "false"]).default("false"),
  LINKEDIN_BROWSER_PROVIDER: z.enum(["browserless", "anchor"]).default("anchor"),
  BROWSERLESS_ENDPOINT: z.url().default("https://production-sfo.browserless.io"),
  BROWSERLESS_API_TOKEN: z.string().default(""),
  ANCHOR_API_URL: z.url().default("https://api.anchorbrowser.io"),
  ANCHOR_CONNECT_URL: z.url().default("wss://connect.anchorbrowser.io"),
  ANCHOR_API_KEY: z.string().default(""),
  LINKEDIN_MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().max(2).default(2),
  LINKEDIN_LOGIN_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  BROWSERLESS_RECONNECT_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(30000),
  LINKEDIN_SESSION_TIMEOUT_MS: z.coerce.number().int().positive().default(2700000),
  LINKEDIN_PROFILE_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(2500),
  LINKEDIN_PROFILE_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(5500),
}).refine(
  (config) => config.LINKEDIN_PROFILE_DELAY_MIN_MS <= config.LINKEDIN_PROFILE_DELAY_MAX_MS,
  { message: "LINKEDIN_PROFILE_DELAY_MIN_MS must be less than or equal to LINKEDIN_PROFILE_DELAY_MAX_MS" },
);

export function readLinkedInConfig(
  environment: Record<string, string | undefined> = process.env,
): LinkedInProviderConfig {
  const config = environmentSchema.parse(environment);
  const activeToken = config.LINKEDIN_BROWSER_PROVIDER === "anchor" ? config.ANCHOR_API_KEY : config.BROWSERLESS_API_TOKEN;

  return {
    enabled: config.LINKEDIN_REMOTE_SYNC_ENABLED === "true" && activeToken.trim().length > 0,
    provider: config.LINKEDIN_BROWSER_PROVIDER,
    endpoint: config.BROWSERLESS_ENDPOINT,
    token: config.BROWSERLESS_API_TOKEN,
    anchorApiUrl: config.ANCHOR_API_URL,
    anchorConnectUrl: config.ANCHOR_CONNECT_URL,
    anchorApiKey: config.ANCHOR_API_KEY,
    maxConcurrentSessions: config.LINKEDIN_MAX_CONCURRENT_SESSIONS,
    loginTimeoutMs: config.LINKEDIN_LOGIN_TIMEOUT_MS,
    reconnectTimeoutMs: config.BROWSERLESS_RECONNECT_TIMEOUT_MS,
    sessionTimeoutMs: config.LINKEDIN_SESSION_TIMEOUT_MS,
    profileDelayMinMs: config.LINKEDIN_PROFILE_DELAY_MIN_MS,
    profileDelayMaxMs: config.LINKEDIN_PROFILE_DELAY_MAX_MS,
  };
}
