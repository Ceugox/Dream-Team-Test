import { readLinkedInConfig } from "./config";
import { createBrowserlessProvider } from "./providers/browserless";
import { createLinkedInSyncService, type LinkedInSyncService } from "./syncService";
import type { OpenJobSignal } from "./prioritization";
import { persistLinkedInInventory, persistLinkedInProfile } from "../platform/adminNetwork";
import { listJobs } from "../platform/repository";
import { parseJobDescription } from "../matching/jobParser";

let cached: LinkedInSyncService | null = null;

async function listOpenJobSignals(): Promise<OpenJobSignal[]> {
  const jobs = await listJobs();
  return jobs
    .filter((job) => job.status === "open")
    .map((job) => {
      const profile = parseJobDescription(`${job.title} - ${job.company} - ${job.location ?? "Remoto"}\n${job.description}`, job.title);
      return {
        title: job.title,
        company: job.company,
        location: job.location,
        skills: [...profile.requiredSkills, ...profile.preferredSkills],
      };
    });
}

export function getLinkedInSyncService(): LinkedInSyncService {
  if (cached) return cached;
  const config = readLinkedInConfig();
  if (!config.enabled) throw new Error("LINKEDIN_SYNC_DISABLED");
  const provider = createBrowserlessProvider({
    endpoint: config.endpoint,
    token: config.token,
    loginTimeoutMs: config.loginTimeoutMs,
    reconnectTimeoutMs: config.reconnectTimeoutMs,
  });
  cached = createLinkedInSyncService({
    config,
    provider,
    listOpenJobs: listOpenJobSignals,
    persistInventory: persistLinkedInInventory,
    persistProfile: persistLinkedInProfile,
  });
  return cached;
}

export function resetLinkedInSyncRuntime(): void {
  cached = null;
}
