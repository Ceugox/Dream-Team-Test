import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeConfidence, rankCandidates } from "./scoreRegistry";

test("computeConfidence rewards more populated fields with higher identity/overall confidence", () => {
  const sparse = createPerson({ id: "1", name: "A" });
  const rich = createPerson({
    id: "2",
    name: "B",
    linkedinUrl: "https://linkedin.com/in/b",
    headline: "Engineer at X",
    currentCompany: "X",
    currentRole: "Engineer",
    location: "SP",
    skills: ["python"],
  });
  const sparseConf = computeConfidence(sparse);
  const richConf = computeConfidence(rich);
  expect(richConf.overall).toBeGreaterThan(sparseConf.overall);
});

test("rankCandidates sorts descending by referralScore and attaches evidence", () => {
  const job = JobProfileSchema.parse({
    title: "Senior Backend Engineer",
    description: "...",
    requiredSkills: ["python"],
    seniority: "senior",
    location: "Sao Paulo",
  });
  const strong = createPerson({
    id: "1", name: "Bruno", headline: "Senior Backend Engineer, Python at Nubank", skills: ["python"], location: "Sao Paulo",
    linkedinUrl: "https://linkedin.com/in/bruno",
  });
  const weak = createPerson({ id: "2", name: "Vitoria", headline: "Sales Executive at Salesforce", location: "Rio de Janeiro" });

  const ranked = rankCandidates([weak, strong], job);
  expect(ranked[0].id).toBe("1");
  expect(ranked[0].referralScore).toBeGreaterThan(ranked[1].referralScore ?? 0);
  expect(ranked[0].referralEvidence.length).toBeGreaterThan(0);
});
