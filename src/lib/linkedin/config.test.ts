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

  it("usa um timeout curto para handoff e limita-o ao máximo do Browserless", () => {
    expect(readLinkedInConfig({}).reconnectTimeoutMs).toBe(30_000);
    expect(readLinkedInConfig({ BROWSERLESS_RECONNECT_TIMEOUT_MS: "300000" }).reconnectTimeoutMs).toBe(300_000);
    expect(() => readLinkedInConfig({ BROWSERLESS_RECONNECT_TIMEOUT_MS: "0" })).toThrow();
    expect(() => readLinkedInConfig({ BROWSERLESS_RECONNECT_TIMEOUT_MS: "300001" })).toThrow();
  });
});
