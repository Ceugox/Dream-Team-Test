import { describe, expect, it } from "vitest";
import { isTrustedAppOrigin, TRUSTED_APP_ORIGINS } from "./origins.js";

describe("isTrustedAppOrigin", () => {
  it("aceita a origem de produção", () => {
    expect(isTrustedAppOrigin("https://referral-copilot-mvp-production.up.railway.app")).toBe(true);
  });

  it("aceita a porta de desenvolvimento declarada", () => {
    expect(isTrustedAppOrigin("http://localhost:3000")).toBe(true);
    expect(isTrustedAppOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("recusa qualquer outra porta local", () => {
    // O match pattern do manifest não distingue porta: sem esta checagem, qualquer
    // dev server local recebe a lista inteira de conexões do LinkedIn.
    expect(isTrustedAppOrigin("http://localhost:5173")).toBe(false);
    expect(isTrustedAppOrigin("http://localhost:8080")).toBe(false);
    expect(isTrustedAppOrigin("http://127.0.0.1:4000")).toBe(false);
    expect(isTrustedAppOrigin("http://localhost")).toBe(false);
  });

  it("recusa host estranho, esquema trocado e sufixo parecido", () => {
    expect(isTrustedAppOrigin("https://evil.example.com")).toBe(false);
    expect(isTrustedAppOrigin("http://referral-copilot-mvp-production.up.railway.app")).toBe(false);
    expect(isTrustedAppOrigin("https://referral-copilot-mvp-production.up.railway.app.evil.com")).toBe(false);
    expect(isTrustedAppOrigin("https://evil.com/?x=https://referral-copilot-mvp-production.up.railway.app")).toBe(false);
  });

  it("recusa entrada vazia ou inválida", () => {
    expect(isTrustedAppOrigin(undefined)).toBe(false);
    expect(isTrustedAppOrigin(null)).toBe(false);
    expect(isTrustedAppOrigin("")).toBe(false);
    expect(isTrustedAppOrigin("null")).toBe(false);
    expect(isTrustedAppOrigin("not an origin")).toBe(false);
  });

  it("mantém a lista de origens explícita e enxuta", () => {
    expect(TRUSTED_APP_ORIGINS).toEqual([
      "https://referral-copilot-mvp-production.up.railway.app",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
