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
import { setAdminSession, setMemberSession } from "@/lib/platform/auth";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  // Sessão é assinada com HMAC: sem segredo, nem dá para montar o cenário.
  process.env.APP_SECRET = "test-secret";
  cookieValues.clear();
});

afterEach(() => {
  process.env = { ...originalEnv };
  cookieValues.clear();
});

describe("logout route", () => {
  it("redirects an admin to the public origin instead of the internal container host", async () => {
    await setAdminSession("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    // Atrás do proxy do Railway a URL do request carrega o host interno: ele não pode vazar para o navegador.
    const request = new Request("https://localhost:8080/api/logout", {
      method: "POST",
      headers: { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.com/admin/login");
  });

  it("keeps working on a local origin without proxy headers", async () => {
    await setAdminSession("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    const response = await POST(new Request("http://localhost:3000/api/logout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("sends a member back to the access choice, not to the admin login", async () => {
    await setMemberSession("33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222");
    const response = await POST(new Request("http://localhost:3000/api/logout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("clears both session cookies", async () => {
    await setAdminSession("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    await setMemberSession("33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222");

    await POST(new Request("http://localhost:3000/api/logout", { method: "POST" }));

    expect(cookieValues.has("rc_admin")).toBe(false);
    expect(cookieValues.has("rc_member")).toBe(false);
  });
});
