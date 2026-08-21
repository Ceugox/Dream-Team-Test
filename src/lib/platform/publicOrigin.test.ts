import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "./publicOrigin";

describe("public application origin", () => {
  it("uses the explicit application URL before an internal request origin", () => {
    const request = new Request("http://localhost:3000/api/admin/invitations");
    expect(resolvePublicOrigin(request, { APP_URL: "https://app.example.com/path" })).toBe("https://app.example.com");
  });

  it("uses the Railway public domain when APP_URL is absent", () => {
    const request = new Request("http://localhost:3000/api/admin/invitations");
    expect(resolvePublicOrigin(request, { RAILWAY_PUBLIC_DOMAIN: "referral.example.up.railway.app" })).toBe("https://referral.example.up.railway.app");
  });

  it("respects trusted proxy headers outside Railway", () => {
    const request = new Request("http://localhost:3000/api/admin/invitations", { headers: { "x-forwarded-host": "people.example.com", "x-forwarded-proto": "https" } });
    expect(resolvePublicOrigin(request, {})).toBe("https://people.example.com");
  });

  it("keeps the request origin for local development", () => {
    const request = new Request("http://localhost:3000/api/admin/invitations");
    expect(resolvePublicOrigin(request, {})).toBe("http://localhost:3000");
  });

  it("refuses to trust proxy headers in production", () => {
    const request = new Request("http://localhost:8080/api/admin/invitations", { headers: { "x-forwarded-host": "atacante.example.com" } });
    expect(() => resolvePublicOrigin(request, { NODE_ENV: "production" })).toThrow(/required in production/);
  });

  it("uses the configured origin in production instead of the forwarded host", () => {
    const request = new Request("http://localhost:8080/api/admin/invitations", { headers: { "x-forwarded-host": "atacante.example.com" } });
    expect(resolvePublicOrigin(request, { NODE_ENV: "production", RAILWAY_PUBLIC_DOMAIN: "app.up.railway.app" })).toBe("https://app.up.railway.app");
  });
});
