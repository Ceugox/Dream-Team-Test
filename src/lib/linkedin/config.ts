import { z } from "zod";
import type { LinkedInProviderConfig } from "./types";

const environmentSchema = z.object({
  LINKEDIN_REMOTE_SYNC_ENABLED: z.enum(["true", "false"]).default("false"),
  BROWSERLESS_ENDPOINT: z.url().default("https://production-sfo.browserless.io"),
  BROWSERLESS_API_TOKEN: z.string().default(""),
  LINKEDIN_MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().max(2).default(2),
  LINKEDIN_LOGIN_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
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

  return {
    enabled: config.LINKEDIN_REMOTE_SYNC_ENABLED === "true" && config.BROWSERLESS_API_TOKEN.trim().length > 0,
    endpoint: config.BROWSERLESS_ENDPOINT,
    token: config.BROWSERLESS_API_TOKEN,
    maxConcurrentSessions: config.LINKEDIN_MAX_CONCURRENT_SESSIONS,
    loginTimeoutMs: config.LINKEDIN_LOGIN_TIMEOUT_MS,
    sessionTimeoutMs: config.LINKEDIN_SESSION_TIMEOUT_MS,
    profileDelayMinMs: config.LINKEDIN_PROFILE_DELAY_MIN_MS,
    profileDelayMaxMs: config.LINKEDIN_PROFILE_DELAY_MAX_MS,
  };
}
