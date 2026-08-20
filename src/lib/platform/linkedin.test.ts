import { describe, expect, it } from "vitest";
import { buildLinkedInAuthorizationUrl, parseLinkedInConnections } from "./linkedin";

describe("LinkedIn network connector", () => {
  it("builds the standard OIDC flow without restricted access by default", () => {
    const url = new URL(buildLinkedInAuthorizationUrl({ clientId: "client", redirectUri: "https://app.test/callback", state: "state", includeConnections: false }));
    expect(url.origin).toBe("https://www.linkedin.com");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
  });

  it("adds the restricted connections permission only when approved", () => {
    const url = new URL(buildLinkedInAuthorizationUrl({ clientId: "client", redirectUri: "https://app.test/callback", state: "state", includeConnections: true }));
    expect(url.searchParams.get("scope")).toContain("r_1st_connections");
  });

  it("normalizes first-degree connections", () => {
    expect(parseLinkedInConnections({ elements: [{ "to~": { localizedFirstName: "Ana", localizedLastName: "Lima", localizedHeadline: "VP Engineering" } }], paging: { total: 1 } })).toEqual({
      contacts: [{ name: "Ana Lima", headline: "VP Engineering", phone: null, profileContext: "Conexão de 1º grau no LinkedIn" }], total: 1,
    });
  });
});
