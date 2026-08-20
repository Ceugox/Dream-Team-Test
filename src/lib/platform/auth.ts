import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "rc_admin";
const MEMBER_COOKIE = "rc_member";

export type AdminSession = { role: "admin"; administratorId: string; organizationId: string; exp: number };
export type MemberSession = { role: "member"; memberId: string; organizationId: string; exp: number };
export type AuthenticatedActor =
  | { role: "admin"; ownerId: string; organizationId: string }
  | { role: "member"; ownerId: string; organizationId: string };

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("APP_SECRET is required in production");
  return value ?? "local-development-secret-change-me";
}

function encode(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decode<T extends { exp: number }>(value?: string): T | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  return payload.exp > Date.now() ? payload : null;
}

export function verifyAdminKey(input: string): boolean {
  const configured = process.env.ADMIN_ACCESS_KEY;
  if (!configured && process.env.NODE_ENV === "production") return false;
  const expected = Buffer.from(configured ?? "admin-wow");
  const received = Buffer.from(input);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function setAdminSession(administratorId: string, organizationId: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, encode({ role: "admin", administratorId, organizationId, exp: Date.now() + 1000 * 60 * 60 * 12 } satisfies AdminSession), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const session=decode<AdminSession>(store.get(ADMIN_COOKIE)?.value);
  return session?.role === "admin" && !!session.administratorId && !!session.organizationId ? session : null;
}

export async function setMemberSession(memberId: string, organizationId: string): Promise<void> {
  const store = await cookies();
  store.set(MEMBER_COOKIE, encode({ role: "member", memberId, organizationId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 } satisfies MemberSession), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getMemberSession(): Promise<MemberSession | null> {
  const store = await cookies();
  const session = decode<MemberSession>(store.get(MEMBER_COOKIE)?.value);
  return session?.role === "member" ? session : null;
}

export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null> {
  const admin = await getAdminSession();
  if (admin) {
    return { role: "admin", ownerId: admin.administratorId, organizationId: admin.organizationId };
  }

  const member = await getMemberSession();
  if (!member || !member.memberId || !member.organizationId) return null;
  return { role: "member", ownerId: member.memberId, organizationId: member.organizationId };
}

export async function clearSessions(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  store.delete(MEMBER_COOKIE);
}

export function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}
