import { describe, expect, it } from "vitest";
import { buildOutreachMessage, buildWhatsAppUrl, normalizePhone } from "./whatsapp";

describe("WhatsApp click-to-chat", () => {
  it("normalizes Brazilian mobile numbers", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("+55 11 98765-4321")).toBe("5511987654321");
  });

  it("rejects invalid phones", () => {
    expect(normalizePhone("123")).toBeNull();
  });

  it("encodes a message into the official click-to-chat URL", () => {
    expect(buildWhatsAppUrl("+55 11 98765-4321", "Olá, Ana! Vaga & indicação"))
      .toBe("https://wa.me/5511987654321?text=Ol%C3%A1%2C%20Ana!%20Vaga%20%26%20indica%C3%A7%C3%A3o");
  });

  it("uses distinct, reviewable messages for candidates and connectors", () => {
    const base={name:"Ana",title:"Staff Engineer",company:"Acme",context:"fintech"};
    expect(buildOutreachMessage({...base,kind:"candidate_fit"})).toContain("oportunidade");
    expect(buildOutreachMessage({...base,kind:"connector_fit"})).toContain("buscando indicações");
  });
});
