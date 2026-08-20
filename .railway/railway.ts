import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const DreamTeamTest = github("Ceugox/Dream-Team-Test");

  const Postgres = postgres("Postgres");
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const referralCopilotMvp = service("referral-copilot-mvp", {
    source: DreamTeamTest,
    replicas: 1,
    env: {
      ADMIN_ACCESS_KEY: preserve(),
      APP_SECRET: preserve(),
      APP_URL: preserve(),
      BROWSERLESS_ENDPOINT: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      GEMINI_MODEL: preserve(),
      LINKEDIN_LOGIN_TIMEOUT_MS: preserve(),
      LINKEDIN_MAX_CONCURRENT_SESSIONS: preserve(),
      LINKEDIN_PROFILE_DELAY_MAX_MS: preserve(),
      LINKEDIN_PROFILE_DELAY_MIN_MS: preserve(),
      LINKEDIN_REMOTE_SYNC_ENABLED: preserve(),
      LINKEDIN_SESSION_TIMEOUT_MS: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_MODEL: preserve(),
    },
  });
  const referralCopilotWorker = service("referral-copilot-worker", {
    source: DreamTeamTest,
    replicas: 1,
    env: {
      APP_SECRET: preserve(),
      BROWSERLESS_ENDPOINT: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      GEMINI_MODEL: preserve(),
      LINKEDIN_LOGIN_TIMEOUT_MS: preserve(),
      LINKEDIN_MAX_CONCURRENT_SESSIONS: preserve(),
      LINKEDIN_PROFILE_DELAY_MAX_MS: preserve(),
      LINKEDIN_PROFILE_DELAY_MIN_MS: preserve(),
      LINKEDIN_REMOTE_SYNC_ENABLED: preserve(),
      LINKEDIN_SESSION_TIMEOUT_MS: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_MODEL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  });
  const intelligenceWorker = service("intelligence-worker", {
    source: DreamTeamTest,
    replicas: 1,
    env: {
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      GEMINI_MODEL: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_MODEL: preserve(),
      RAILPACK_START_CMD: preserve(),
      WORKER_CONCURRENCY: preserve(),
      WORKER_POLL_MS: preserve(),
    },
  });

  return project("referral-copilot-mvp", {
    resources: [Postgres, referralCopilotMvp, referralCopilotWorker, intelligenceWorker, postgresVolume],
  });
});
