import { afterEach, describe, expect, it, vi } from "vitest";

const cookieValues = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => cookieValues.set(name, value),
    delete: (name: string) => cookieValues.delete(name),
  })),
}));

import {
  createInviteToken,
  getAuthenticatedActor,
  hashInviteToken,
  setAdminSession,
  setMemberSession,
  verifyAdminKey,
} from "./auth";

const originalKey = process.env.ADMIN_ACCESS_KEY;
const originalSecret = process.env.APP_SECRET;

afterEach(() => {
  process.env.ADMIN_ACCESS_KEY = originalKey;
  process.env.APP_SECRET = originalSecret;
  cookieValues.clear();
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

  it("returns the valid admin actor before a member actor", async () => {
    await setMemberSession("member-1", "org-1");
    await setAdminSession("admin-1", "org-1");

    await expect(getAuthenticatedActor()).resolves.toEqual({
      role: "admin",
      ownerId: "admin-1",
      organizationId: "org-1",
    });
  });

  it("returns the valid member actor when no admin session exists", async () => {
    await setMemberSession("member-1", "org-1");

    await expect(getAuthenticatedActor()).resolves.toEqual({
      role: "member",
      ownerId: "member-1",
      organizationId: "org-1",
    });
  });
});
