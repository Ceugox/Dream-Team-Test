import { expect, test } from "vitest";
import { parseJobDescription } from "./jobParser";

const JD = `
Senior Backend Engineer - Nubank - Sao Paulo

We are looking for a Senior Backend Engineer to join our Payments team.
Required: Python, distributed systems, AWS.
Nice to have: Kotlin, Kafka.
Fintech experience is a big plus.
`;

test("extracts title, seniority, skills, location and industry from free text", () => {
  const job = parseJobDescription(JD);
  expect(job.title).toBe("Senior Backend Engineer");
  expect(job.seniority).toBe("senior");
  expect(job.requiredSkills.map((s) => s.toLowerCase())).toEqual(
    expect.arrayContaining(["python", "distributed systems", "aws"])
  );
  expect(job.preferredSkills.map((s) => s.toLowerCase())).toEqual(
    expect.arrayContaining(["kotlin", "kafka"])
  );
  expect(job.location).toBe("Sao Paulo");
  expect(job.industry).toBe("fintech");
});

test("falls back to titleHint when the text has no clear title line", () => {
  const job = parseJobDescription("Just some loose text about Python and AWS.", "Backend Engineer");
  expect(job.title).toBe("Backend Engineer");
});
