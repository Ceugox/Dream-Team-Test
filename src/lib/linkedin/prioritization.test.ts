import { describe, expect, it } from "vitest";
import { prioritizeInventory, type OpenJobSignal } from "./prioritization";
import { LINKEDIN_SELECTOR_VERSION, type InventoryEntry, type ObservedField } from "./collectors/schemas";

const observedAt = "2026-08-20T12:00:00.000Z";

function field(value: string | null): ObservedField<string> {
  return { value, sourceUrl: "https://www.linkedin.com/mynetwork/invite-connect/connections/", observedAt, confidence: 0.95 };
}

function entry(url: string, headline: string | null, location: string | null = null): InventoryEntry {
  return {
    selectorVersion: LINKEDIN_SELECTOR_VERSION,
    profileUrl: field(url),
    name: field(null),
    headline: field(headline),
    photoUrl: field(null),
    location: field(location),
    connectionDegree: field(null),
  };
}

const paymentsJob: OpenJobSignal = {
  title: "Head of Payments Partnerships",
  company: "FinCo",
  location: "São Paulo",
  skills: ["payments", "partnerships", "negotiation"],
};

describe("LinkedIn inventory prioritization", () => {
  it("ranks a strong open-job match ahead of a generic contact", () => {
    const generic = entry("https://www.linkedin.com/in/generic", "Operations Analyst");
    const strong = entry("https://www.linkedin.com/in/strong", "Payments Partnerships Director at FinCo", "São Paulo");

    const ordered = prioritizeInventory([generic, strong], [paymentsJob]);

    expect(ordered[0].profileUrl.value).toBe("https://www.linkedin.com/in/strong");
    expect(ordered[1].profileUrl.value).toBe("https://www.linkedin.com/in/generic");
  });

  it("keeps the original order when there are no open jobs", () => {
    const first = entry("https://www.linkedin.com/in/zeta", "Payments lead");
    const second = entry("https://www.linkedin.com/in/alpha", "Engineer");

    const ordered = prioritizeInventory([first, second], []);

    expect(ordered.map((item) => item.profileUrl.value)).toEqual([
      "https://www.linkedin.com/in/zeta",
      "https://www.linkedin.com/in/alpha",
    ]);
  });

  it("breaks score ties by canonical profile URL", () => {
    const beta = entry("https://www.linkedin.com/in/beta", "Payments partnerships");
    const alpha = entry("https://www.linkedin.com/in/alpha", "Payments partnerships");

    const ordered = prioritizeInventory([beta, alpha], [paymentsJob]);

    expect(ordered.map((item) => item.profileUrl.value)).toEqual([
      "https://www.linkedin.com/in/alpha",
      "https://www.linkedin.com/in/beta",
    ]);
  });

  it("is deterministic across repeated runs", () => {
    const entries = [
      entry("https://www.linkedin.com/in/one", "Negotiation specialist"),
      entry("https://www.linkedin.com/in/two", "Payments partnerships at FinCo"),
      entry("https://www.linkedin.com/in/three", null),
    ];

    const first = prioritizeInventory(entries, [paymentsJob]).map((item) => item.profileUrl.value);
    const second = prioritizeInventory(entries, [paymentsJob]).map((item) => item.profileUrl.value);

    expect(first).toEqual(second);
    expect(first[0]).toBe("https://www.linkedin.com/in/two");
    expect(first[2]).toBe("https://www.linkedin.com/in/three");
  });
});
