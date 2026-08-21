import { describe, expect, it } from "vitest";
import { createSafeLogger, sanitizeForLog } from "./safeLogger";

describe("safe logger", () => {
  it("redacts sensitive keys at any depth", () => {
    const sanitized = sanitizeForLog({
      sessionId: "session-1",
      token: "sk-secret",
      nested: {
        cookie: "li_at=abc",
        authorization: "Bearer abc",
        password: "hunter2",
        providerSessionReference: "enc:v1:payload",
        provider_session_reference: "enc:v1:payload",
      },
      list: [{ apiSecret: "x" }],
    }) as Record<string, unknown>;
    expect(sanitized.sessionId).toBe("session-1");
    expect(sanitized.token).toBe("[REDACTED]");
    const nested = sanitized.nested as Record<string, unknown>;
    expect(Object.values(nested)).toEqual(["[REDACTED]", "[REDACTED]", "[REDACTED]", "[REDACTED]", "[REDACTED]"]);
    expect((sanitized.list as Array<Record<string, unknown>>)[0].apiSecret).toBe("[REDACTED]");
  });

  it("redacts secret-shaped values inside strings", () => {
    const sanitized = sanitizeForLog({
      message: "connect failed for wss://chrome.browserless.io/session?token=abc123 with Bearer xyz and enc:v1:payload",
    }) as Record<string, unknown>;
    const message = String(sanitized.message);
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("wss://");
    expect(message).not.toContain("Bearer xyz");
    expect(message).not.toContain("enc:v1:payload");
  });

  it("keeps the operational fields intact", () => {
    const sanitized = sanitizeForLog({
      event: "task_completed",
      sessionId: "s1",
      ownerType: "admin",
      status: "results_available",
      inventoryCount: 12,
      enrichedCount: 4,
      failedCount: 1,
      durationMs: 1234,
      failureCode: "checkpoint",
    });
    expect(sanitized).toEqual({
      event: "task_completed",
      sessionId: "s1",
      ownerType: "admin",
      status: "results_available",
      inventoryCount: 12,
      enrichedCount: 4,
      failedCount: 1,
      durationMs: 1234,
      failureCode: "checkpoint",
    });
  });

  it("emits single-line JSON through the injected sink", () => {
    const lines: string[] = [];
    const logger = createSafeLogger((line) => lines.push(line));
    logger.info("task_started", { taskId: "t1", token: "leak" });
    logger.error("task_failed", { error: "reconnect wss://host?token=leak2" });
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "task_started", taskId: "t1", token: "[REDACTED]", level: "info" });
    expect(lines[1]).not.toContain("leak2");
  });
});
