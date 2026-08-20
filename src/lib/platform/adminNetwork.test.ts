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

  it("ranks talent leaders as likely connectors", () => {
    const job=parseJobDescription("Staff Backend Engineer - Nubank\nRequired: typescript, aws", "Staff Backend Engineer");
    const result=scoreConnectorFit({headline:"Head of Talent for fintech engineering"},job);
    expect(result.score).toBeGreaterThan(.7);
    expect(result.evidence.length).toBeGreaterThan(1);
  });
});
