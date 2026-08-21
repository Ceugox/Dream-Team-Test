import { describe, expect, it } from "vitest";
import { parseAdminNetworkFile, scoreConnectorFit } from "./adminNetwork";
import { parseJobDescription } from "../matching/jobParser";

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

  it("usa a headline como contexto quando não há histórico mais rico", () => {
    const [contact] = parseAdminNetworkFile([
      { name: "Mirela Correa", headline: "Venture Capital @ MAYA Capital", profileUrl: "https://linkedin.com/in/mirela" },
    ]);
    expect(contact.profileContext).toBe("Venture Capital @ MAYA Capital");
  });

  it("prefere o histórico rico à headline quando ambos existem", () => {
    const [contact] = parseAdminNetworkFile([
      { name: "Ana", headline: "Engineer", profileUrl: "https://linkedin.com/in/ana", education: ["ITA"] },
    ]);
    expect(contact.profileContext).toContain("ITA");
    expect(contact.profileContext).not.toBe("Engineer");
  });

  it("ranks talent leaders as likely connectors", () => {
    const job=parseJobDescription("Staff Backend Engineer - Nubank\nRequired: typescript, aws", "Staff Backend Engineer");
    const result=scoreConnectorFit({headline:"Head of Talent for fintech engineering"},job);
    expect(result.score).toBeGreaterThan(.7);
    expect(result.evidence.length).toBeGreaterThan(1);
  });

  it("usa a área definida manualmente (override) no boost de conector",()=>{
    const job=parseJobDescription("Head of Marketing - Acme\nRequired: growth", "Head of Marketing");
    const withOverride=scoreConnectorFit({headline:"Software Engineer",areaOverride:"growth_mkt"},job);
    const withoutOverride=scoreConnectorFit({headline:"Software Engineer"},job);
    expect(withOverride.evidence).toEqual(expect.arrayContaining([expect.stringContaining("Mesma área da vaga")]));
    expect(withOverride.score).toBeGreaterThan(withoutOverride.score);
  });

  it("uses education and recognized institutions only as connector evidence",()=>{
    const job=parseJobDescription("Staff Backend Engineer - Acme\nRequired: typescript, aws", "Staff Backend Engineer");
    const result=scoreConnectorFit({headline:"Software Engineer",profileContext:"ITA · former McKinsey",networkCapitalScore:.75,networkCapitalEvidence:["Formação Tier A (ITA/IME)"]},job);
    expect(result.score).toBeGreaterThanOrEqual(.35);
    expect(result.evidence).toContain("Formação Tier A (ITA/IME)");
  });
});
