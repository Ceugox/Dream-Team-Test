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

test("linkedin URL match is robust to protocol, www, trailing slash, and case", () => {
  const a = createPerson({ id: "1", name: "Bruno Carvalho", linkedinUrl: "https://www.linkedin.com/in/Bruno-Carvalho/" });
  const b = createPerson({ id: "2", name: "Bruno C.", linkedinUrl: "https://linkedin.com/in/bruno-carvalho" });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(true);
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

test("mergePeople combines relationship data from both records instead of dropping one", () => {
  const survivor = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    relationship: {
      emailsSent: 14, emailsReceived: 18, meetings: 0,
      firstInteraction: null, lastInteraction: "2026-07-13T00:00:00Z",
      reciprocity: null, frequency: null, recency: null, contactSignal: null,
    },
  });
  const mergedIn = createPerson({
    id: "2",
    name: "Bruno C.",
    relationship: {
      emailsSent: 0, emailsReceived: 0, meetings: 5,
      firstInteraction: null, lastInteraction: "2026-07-20T00:00:00Z",
      reciprocity: null, frequency: null, recency: null, contactSignal: null,
    },
  });
  const result = mergePeople(survivor, mergedIn);
  expect(result.relationship?.emailsSent).toBe(14);
  expect(result.relationship?.emailsReceived).toBe(18);
  expect(result.relationship?.meetings).toBe(5);
  expect(result.relationship?.lastInteraction).toBe("2026-07-20T00:00:00Z");
});
