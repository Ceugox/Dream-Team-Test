import { describe, expect, it } from "vitest";
import { buildGoogleAuthorizationUrl, parseGooglePeopleResponse } from "./google";

describe("Google network connector", () => {
  it("builds OAuth with minimal identity and read-only contacts scopes", () => {
    const url = new URL(buildGoogleAuthorizationUrl({ clientId: "client", redirectUri: "https://app.test/callback", state: "state" }));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toContain("contacts.readonly");
  });

  it("normalizes People API connections without inventing names", () => {
    const result = parseGooglePeopleResponse({
      connections: [
        { resourceName: "people/1", names: [{ displayName: "Ana Lima" }], emailAddresses: [{ value: "ANA@EXAMPLE.COM" }], organizations: [{ title: "VP Engineering", name: "Acme", current: true }], phoneNumbers: [{ canonicalForm: "+14155550100" }] },
        { resourceName: "people/2", emailAddresses: [{ value: "missing-name@example.com" }] },
      ],
      nextPageToken: "next",
    });
    expect(result).toEqual({
      contacts: [{ name: "Ana Lima", headline: "VP Engineering · Acme", phone: "+14155550100", profileContext: "Google Contacts · ana@example.com" }],
      nextPageToken: "next",
    });
  });
});
