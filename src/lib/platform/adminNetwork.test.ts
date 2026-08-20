import { describe, expect, it } from "vitest";
import { inventoryEntryToContact, parseAdminNetworkFile, professionalProfileToContact, scoreConnectorFit } from "./adminNetwork";
import { parseJobDescription } from "../matching/jobParser";
import { LINKEDIN_SELECTOR_VERSION, type ObservedField, type ProfessionalProfile } from "../linkedin/collectors/schemas";

const observedAt = "2026-08-20T12:00:00.000Z";
function observed<T>(value: T | null): ObservedField<T> {
  return { value, sourceUrl: "https://www.linkedin.com/in/ana-example", observedAt, confidence: 0.95 };
}

describe("admin network", () => {
  it("deduplicates LinkedIn contacts and normalizes phones", () => {
    const contacts=parseAdminNetworkFile([
      {name:"Ana Silva",headline:"Engineering Manager",profileUrl:"https://linkedin.com/in/ana",phone:"(11) 98765-4321"},
      {name:"Ana Silva",headline:"Engineering Manager",profileUrl:"https://linkedin.com/in/ana"},
    ]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].phone).toBe("5511987654321");
  });

  it("imports optional education and career history as verifiable context",()=>{
    const [contact]=parseAdminNetworkFile([{name:"Ana Silva",headline:"Executive",profileUrl:"https://linkedin.com/in/ana",education:["USP"],experience:["Goldman Sachs"],internationalExperience:true}]);
    expect(contact.profileContext).toContain("USP");
    expect(contact.networkCapitalEvidence).toEqual(expect.arrayContaining(["Formação Tier B (USP/UNICAMP)","Experiência em instituição reconhecida do mercado financeiro"]));
  });

  it("ranks talent leaders as likely connectors", () => {
    const job=parseJobDescription("Staff Backend Engineer - Nubank\nRequired: typescript, aws", "Staff Backend Engineer");
    const result=scoreConnectorFit({headline:"Head of Talent for fintech engineering"},job);
    expect(result.score).toBeGreaterThan(.7);
    expect(result.evidence.length).toBeGreaterThan(1);
  });

  it("uses education and recognized institutions only as connector evidence",()=>{
    const job=parseJobDescription("Staff Backend Engineer - Acme\nRequired: typescript, aws", "Staff Backend Engineer");
    const result=scoreConnectorFit({headline:"Software Engineer",profileContext:"ITA · former McKinsey",networkCapitalScore:.75,networkCapitalEvidence:["Formação Tier A (ITA/IME)"]},job);
    expect(result.score).toBeGreaterThanOrEqual(.35);
    expect(result.evidence).toContain("Formação Tier A (ITA/IME)");
  });

  it("maps a professional snapshot into a contact with verifiable context and capital", () => {
    const profile: ProfessionalProfile = {
      selectorVersion: LINKEDIN_SELECTOR_VERSION,
      profileUrl: observed("https://www.linkedin.com/in/ana-example"),
      name: observed("Ana Example"),
      headline: observed("Engineering Manager"),
      location: observed("São Paulo"),
      summary: observed("Builds platform teams."),
      roles: observed([{ title: "Engineering Manager", company: "Goldman Sachs", startDate: "2023-01", endDate: null }]),
      education: observed([{ school: "USP", degree: "BSc Computer Science", startDate: "2014", endDate: "2018" }]),
      skills: observed(["TypeScript", "Leadership"]),
      certifications: observed(null),
      languages: observed(["Português", "English"]),
      projects: observed(null),
      internationalExperience: observed(["United Kingdom"]),
      mutualConnections: observed<number>(null),
    };

    const contact = professionalProfileToContact(profile);
    expect(contact?.name).toBe("Ana Example");
    expect(contact?.linkedinUrl).toBe("https://www.linkedin.com/in/ana-example");
    expect(contact?.profileContext).toContain("Engineering Manager @ Goldman Sachs");
    expect(contact?.profileContext).toContain("USP");
    expect(contact?.profileContext).toContain("Skills: TypeScript, Leadership");
    expect(contact?.networkCapitalScore).toBeGreaterThan(0);
    expect(contact?.source).toBe("linkedin");
  });

  it("does not build a contact from a nameless snapshot or an inventory entry without URL", () => {
    const nameless: ProfessionalProfile = {
      selectorVersion: LINKEDIN_SELECTOR_VERSION,
      profileUrl: observed("https://www.linkedin.com/in/ana-example"),
      name: observed<string>(null), headline: observed<string>(null), location: observed<string>(null), summary: observed<string>(null),
      roles: observed(null), education: observed(null), skills: observed(null), certifications: observed(null),
      languages: observed(null), projects: observed(null), internationalExperience: observed(null), mutualConnections: observed<number>(null),
    };
    expect(professionalProfileToContact(nameless)).toBeNull();
    expect(inventoryEntryToContact({
      selectorVersion: LINKEDIN_SELECTOR_VERSION,
      profileUrl: observed<string>(null), name: observed("Ana"), headline: observed<string>(null),
      photoUrl: observed<string>(null), location: observed<string>(null), connectionDegree: observed<string>(null),
    })).toBeNull();
  });

  it("derives a readable name from the URL slug when the inventory card has none", () => {
    const contact = inventoryEntryToContact({
      selectorVersion: LINKEDIN_SELECTOR_VERSION,
      profileUrl: observed("https://www.linkedin.com/in/ana-example"), name: observed<string>(null),
      headline: observed("CTO"), photoUrl: observed<string>(null), location: observed("Lisboa"), connectionDegree: observed<string>(null),
    });
    expect(contact?.name).toBe("ana example");
    expect(contact?.profileContext).toContain("Lisboa");
  });
});
