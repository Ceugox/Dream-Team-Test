import { expect, test } from "vitest";
import { TimeBudget } from "./timeBudget";

test("defaults to the 290s spec budget", () => {
  const now = 0;
  const budget = new TimeBudget(undefined, () => now);
  expect(budget.remainingMs()).toBe(290_000);
});

test("isExpired flips true once elapsed passes the total", () => {
  let now = 0;
  const budget = new TimeBudget(1000, () => now);
  expect(budget.isExpired()).toBe(false);
  now = 1500;
  expect(budget.isExpired()).toBe(true);
});

test("phase reflects elapsed time against the spec's target windows", () => {
  let now = 0;
  const budget = new TimeBudget(290_000, () => now);
  expect(budget.phase()).toBe("bootstrap");
  now = 30_000;
  expect(budget.phase()).toBe("discovery");
  now = 90_000;
  expect(budget.phase()).toBe("enrichment");
  now = 150_000;
  expect(budget.phase()).toBe("relationship");
  now = 200_000;
  expect(budget.phase()).toBe("jobEnrichment");
  now = 260_000;
  expect(budget.phase()).toBe("ranking");
  now = 285_000;
  expect(budget.phase()).toBe("finalizing");
});
