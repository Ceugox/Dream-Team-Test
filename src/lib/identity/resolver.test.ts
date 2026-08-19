import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { resolveIdentity, mergePeople } from "./resolver";

test("same linkedin URL merges with near-certain confidence", () => {
  const a = createPerson({ id: "1", name: "Bruno Carvalho", linkedinUrl: "https://linkedin.com/in/bruno" });
  const b = createPerson({ id: "2", name: "Bruno C.", linkedinUrl: "https://linkedin.com/in/bruno" });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(true);
  expect(decision.matchScore).toBeGreaterThanOrEqual(0.95);
  expect(decision.signalsUsed).toContain("linkedinUrl");
});

test("same email merges with near-certain confidence", () => {
  const a = createPerson({ id: "1", name: "Bruno Carvalho", emails: ["bruno@gmail.com"] });
  const b = createPerson({ id: "2", name: "Bruno", emails: ["bruno@gmail.com"] });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(true);
  expect(decision.signalsUsed).toContain("email");
});

test("same name only never merges", () => {
  const a = createPerson({ id: "1", name: "Pedro Almeida" });
  const b = createPerson({ id: "2", name: "Pedro Almeida" });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(false);
  expect(decision.matchScore).toBeLessThan(0.6);
});

test("same name plus same company is a probabilistic match, not automatic", () => {
  const a = createPerson({ id: "1", name: "Pedro Almeida", currentCompany: "Itau Unibanco" });
  const b = createPerson({ id: "2", name: "Pedro Almeida", currentCompany: "Itau Unibanco" });
  const decision = resolveIdentity(a, b);
  expect(decision.matchScore).toBeGreaterThan(0.5);
  expect(decision.matchScore).toBeLessThan(0.95);
  expect(decision.signalsUsed).toContain("name+company");
});

test("mergePeople unions sources and arrays without duplicates", () => {
  const survivor = createPerson({ id: "1", name: "Bruno Carvalho", sources: ["linkedin"], skills: ["python"] });
  const mergedIn = createPerson({ id: "2", name: "Bruno C.", sources: ["gmail"], skills: ["python", "aws"], emails: ["bruno@gmail.com"] });
  const result = mergePeople(survivor, mergedIn);
  expect(result.sources.sort()).toEqual(["gmail", "linkedin"]);
  expect(result.skills.sort()).toEqual(["aws", "python"]);
  expect(result.emails).toEqual(["bruno@gmail.com"]);
});
