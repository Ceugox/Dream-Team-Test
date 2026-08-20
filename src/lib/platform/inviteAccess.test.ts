import { expect, test } from "vitest";
import { extractInviteToken } from "./inviteAccess";

const token = "qJjm54Xsg6XtRobjO5I59v6MkUkkBqv1";

test("extracts a token from a complete invitation URL", () => {
  expect(extractInviteToken(`https://referral.example.com/join/${token}`)).toBe(token);
});

test("accepts the invitation token by itself", () => {
  expect(extractInviteToken(`  ${token}  `)).toBe(token);
});

test("rejects unrelated URLs and malformed codes", () => {
  expect(extractInviteToken("https://referral.example.com/admin/login")).toBeNull();
  expect(extractInviteToken("short-code")).toBeNull();
});
