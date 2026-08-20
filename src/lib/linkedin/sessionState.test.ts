import { describe, expect, it } from "vitest";
import { canTransition, toPublicSession } from "./sessionState";

describe("LinkedIn session state", () => {
  it("permite o caminho feliz e bloqueia regressões", () => {
    expect(canTransition("preparing", "awaiting_login")).toBe(true);
    expect(canTransition("enriching", "results_available")).toBe(true);
    expect(canTransition("completed", "enriching")).toBe(false);
  });

  it("não serializa referência do provider", () => {
    expect(JSON.stringify(toPublicSession({
      id: "session-1", status: "awaiting_login", inventoryCount: 0,
      enrichedCount: 0, failedCount: 0, providerSessionReference: "secret",
      createdAt: new Date(0), expiresAt: new Date(1), failureCode: null,
      failureMessageSafe: null,
    }))).not.toContain("secret");
  });
});
