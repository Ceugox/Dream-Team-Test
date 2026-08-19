import { expect, test } from "vitest";
import { parseHeadline } from "./headline";

test("parses role and company from a standard '<role> at <company>' headline", () => {
  const result = parseHeadline("Senior Backend Engineer at Nubank");
  expect(result.role).toBe("Senior Backend Engineer");
  expect(result.company).toBe("Nubank");
  expect(result.seniority).toBe("senior");
});

test("detects staff/principal seniority", () => {
  expect(parseHeadline("Staff Software Engineer, Distributed Systems at Stone").seniority).toBe("staff");
  expect(parseHeadline("Principal Engineer, Payments at Nubank").seniority).toBe("staff");
});

test("detects junior seniority", () => {
  expect(parseHeadline("Junior Data Analyst at XP Inc").seniority).toBe("junior");
});

test("defaults to unknown seniority when no keyword present", () => {
  expect(parseHeadline("Backend Engineer at Nubank").seniority).toBe("unknown");
});

test("extracts industry keywords from free text", () => {
  const result = parseHeadline("Backend Engineer, Python, Fintech at PagSeguro");
  expect(result.industryKeywords).toContain("fintech");
});

test("handles null headline gracefully", () => {
  const result = parseHeadline(null);
  expect(result).toEqual({ role: null, company: null, seniority: "unknown", industryKeywords: [] });
});
