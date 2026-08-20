import { afterEach, describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken, verifyAdminKey } from "./auth";

const originalKey = process.env.ADMIN_ACCESS_KEY;
const originalSecret = process.env.APP_SECRET;

afterEach(() => {
  process.env.ADMIN_ACCESS_KEY = originalKey;
  process.env.APP_SECRET = originalSecret;
});

describe("platform auth", () => {
  it("compares the admin key without accepting prefixes", () => {
    process.env.ADMIN_ACCESS_KEY = "a-secure-admin-key";
    expect(verifyAdminKey("a-secure-admin-key")).toBe(true);
    expect(verifyAdminKey("a-secure-admin")).toBe(false);
  });

  it("creates opaque invite tokens and stable hashes", () => {
    process.env.APP_SECRET = "test-secret";
    const first = createInviteToken();
    const second = createInviteToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(20);
    expect(hashInviteToken(first)).toBe(hashInviteToken(first));
    expect(hashInviteToken(first)).not.toBe(first);
  });
});
