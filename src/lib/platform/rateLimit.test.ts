import { describe, expect, it } from "vitest";
import { checkRateLimit, clientKey, type RateLimitBucket } from "./rateLimit";

const options = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  it("libera até o limite e bloqueia depois", () => {
    const bucket: RateLimitBucket = new Map();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 + attempt }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1004 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("libera de novo quando a janela passa", () => {
    const bucket: RateLimitBucket = new Map();
    for (let attempt = 0; attempt < 3; attempt += 1) checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 });
    expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 }).allowed).toBe(false);
    expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 + 60_001 }).allowed).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    const bucket: RateLimitBucket = new Map();
    for (let attempt = 0; attempt < 3; attempt += 1) checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 });
    expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 }).allowed).toBe(false);
    expect(checkRateLimit(bucket, "2.2.2.2", { ...options, now: 1000 }).allowed).toBe(true);
  });

  it("informa quantas tentativas restam", () => {
    const bucket: RateLimitBucket = new Map();
    expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 }).remaining).toBe(2);
    expect(checkRateLimit(bucket, "1.1.1.1", { ...options, now: 1000 }).remaining).toBe(1);
  });
});

describe("clientKey", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    const request = new Request("https://app.test/api/admin/login", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(clientKey(request)).toBe("203.0.113.9");
  });

  it("cai para x-real-ip e depois para unknown", () => {
    expect(clientKey(new Request("https://app.test/x", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe("198.51.100.4");
    expect(clientKey(new Request("https://app.test/x"))).toBe("unknown");
  });
});
