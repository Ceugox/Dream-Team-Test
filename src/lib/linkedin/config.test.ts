import { describe, expect, it } from "vitest";
import { readLinkedInConfig } from "./config";

describe("LinkedIn configuration", () => {
  it("desabilita a sincronização quando o token Browserless está em branco", () => {
    expect(readLinkedInConfig({
      LINKEDIN_REMOTE_SYNC_ENABLED: "true",
      BROWSERLESS_API_TOKEN: "   ",
    }).enabled).toBe(false);
  });

  it("aceita o limite do piloto e rejeita valores maiores", () => {
    expect(readLinkedInConfig({ LINKEDIN_MAX_CONCURRENT_SESSIONS: "2" }).maxConcurrentSessions).toBe(2);
    expect(() => readLinkedInConfig({ LINKEDIN_MAX_CONCURRENT_SESSIONS: "3" })).toThrow();
  });
});
