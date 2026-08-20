import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalizeLinkedInProfileUrl,
  parseConnectionInventory,
  parseProfessionalProfile,
} from "./domParsers";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const observedAt = "2026-08-20T12:00:00.000Z";

describe("LinkedIn DOM parsers", () => {
  it("canonicalizes LinkedIn URLs before inventory deduplication", () => {
    expect(canonicalizeLinkedInProfileUrl("https://www.linkedin.com/in/ada-example/?trk=feed#about"))
      .toBe("https://www.linkedin.com/in/ada-example");
    const result = parseConnectionInventory(fixture("connections.html"), {
      sourceUrl: "https://www.linkedin.com/mynetwork/invite-connect/connections/",
      observedAt,
    });
    expect(result).toHaveLength(2);
    expect(result[0].profileUrl.value).toBe("https://www.linkedin.com/in/ada-example");
  });

  it("parses approved professional evidence without inferring a tier or seniority", () => {
    const profile = parseProfessionalProfile(fixture("profile-complete.html"), {
      sourceUrl: "https://www.linkedin.com/in/alex-example/",
      observedAt,
    });
    expect(profile.roles.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Director of Partnerships", startDate: "2023-04" }),
      expect.objectContaining({ title: "Partnerships Manager", endDate: "2023-03" }),
    ]));
    expect(profile.education.value?.[0]).toMatchObject({ school: "Example University", startDate: "2018" });
    expect(profile.skills.value).toEqual(["Business Development", "Negotiation"]);
    expect(profile.certifications.value?.[0]).toMatchObject({ name: "Certified Partnerships Professional", issuedDate: "2024-01" });
    expect(profile.languages.value).toEqual(["English", "Portuguese"]);
    expect(profile.summary.value).toBe("Builds trusted international partnerships.");
    expect(profile.projects.value?.[0]).toMatchObject({ name: "Global partner launch" });
    expect(profile.internationalExperience.value).toEqual(["Portugal", "Brazil", "United Kingdom"]);
    expect(profile.mutualConnections.value).toBe(3);
    expect(JSON.stringify(profile).toLowerCase()).not.toMatch(/tier|seniority/);
  });

  it("uses null for missing fields and preserves partial dates", () => {
    const profile = parseProfessionalProfile(fixture("profile-sparse.html"), {
      sourceUrl: "https://www.linkedin.com/in/casey-example",
      observedAt,
    });
    expect(profile.location.value).toBeNull();
    expect(profile.education.value).toBeNull();
    expect(profile.roles.value?.[0]).toMatchObject({ startDate: "2025-01", endDate: null });
  });

  it("lowers confidence when a semantic fallback selector supplies a field", () => {
    const profile = parseProfessionalProfile(
      '<main><h1>Fallback Example</h1><section><h2>About</h2><p>Fallback summary</p></section></main>',
      { sourceUrl: "https://www.linkedin.com/in/fallback-example", observedAt },
    );
    expect(profile.summary.value).toBe("Fallback summary");
    expect(profile.summary.confidence).toBeLessThan(0.9);
  });
});
