import { expect, test } from "vitest";
import { JobProfileSchema } from "./job";

test("JobProfile validates minimal input with defaults", () => {
  const job = JobProfileSchema.parse({ title: "Senior Backend Engineer", description: "..." });
  expect(job.requiredSkills).toEqual([]);
  expect(job.preferredSkills).toEqual([]);
  expect(job.company).toBeNull();
});
