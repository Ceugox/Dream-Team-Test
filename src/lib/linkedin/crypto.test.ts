import { afterEach, describe, expect, it } from "vitest";
import {
  assertEncryptedProviderSessionReference,
  decryptProviderSessionReference,
  encryptProviderSessionReference,
} from "./crypto";

const testSecret = "test-only-linkedin-session-secret";
const originalSecret = process.env.APP_SECRET;

afterEach(() => {
  process.env.APP_SECRET = originalSecret;
});

describe("LinkedIn provider session encryption", () => {
  it("round-trips a versioned encrypted envelope without exposing plaintext", () => {
    const plaintext = "provider-session-private-value";
    const encrypted = encryptProviderSessionReference(plaintext, testSecret);

    expect(encrypted).toMatch(/^enc:v1:[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptProviderSessionReference(encrypted, testSecret)).toBe(plaintext);
  });

  it("uses a fresh random IV for each encryption", () => {
    const first = encryptProviderSessionReference("same-provider-session", testSecret);
    const second = encryptProviderSessionReference("same-provider-session", testSecret);

    expect(first).not.toBe(second);
  });

  it("rejects tampered envelopes and wrong keys with safe errors", () => {
    const plaintext = "private-provider-session";
    const encrypted = encryptProviderSessionReference(plaintext, testSecret);
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    for (const attempt of [
      () => decryptProviderSessionReference(tampered, testSecret),
      () => decryptProviderSessionReference(encrypted, "different-test-secret"),
    ]) {
      try {
        attempt();
        throw new Error("expected decryption to reject");
      } catch (error) {
        expect(error).toHaveProperty("message", "INVALID_ENCRYPTED_PROVIDER_SESSION_REFERENCE");
        expect(String(error)).not.toContain(plaintext);
        expect(String(error)).not.toContain(testSecret);
      }
    }
  });

  it("rejects a prefix-valid raw token envelope", () => {
    const rawTokenEnvelope = `enc:v1:${Buffer.from("token=raw-provider-cookie", "utf8").toString("base64url")}`;

    expect(() => assertEncryptedProviderSessionReference(rawTokenEnvelope, testSecret))
      .toThrow("INVALID_ENCRYPTED_PROVIDER_SESSION_REFERENCE");
  });

  it("requires APP_SECRET when no explicit test secret is injected", () => {
    delete process.env.APP_SECRET;

    expect(() => encryptProviderSessionReference("provider-session")).toThrow("LINKEDIN_CRYPTO_SECRET_UNAVAILABLE");
  });
});
