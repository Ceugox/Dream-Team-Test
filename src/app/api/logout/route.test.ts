import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "./route";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  cookieValues.set("rc_admin", "admin-session");
  cookieValues.set("rc_member", "member-session");
});

afterEach(() => {
  process.env = { ...originalEnv };
  cookieValues.clear();
});

describe("logout route", () => {
  it("redirects to the public origin instead of the internal container host", async () => {
    // Behind the Railway proxy the request URL carries the internal host, so it must not reach the browser.
    const request = new Request("https://localhost:8080/api/logout", {
      method: "POST",
      headers: { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/admin/login");
  });

  it("keeps working on a local origin without proxy headers", async () => {
    const request = new Request("http://localhost:3000/api/logout", { method: "POST" });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("clears both session cookies", async () => {
    await POST(new Request("http://localhost:3000/api/logout", { method: "POST" }));

    expect(cookieValues.has("rc_admin")).toBe(false);
    expect(cookieValues.has("rc_member")).toBe(false);
  });
});
