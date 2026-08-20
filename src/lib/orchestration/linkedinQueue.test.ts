import { describe, expect, it } from "vitest";
import {
  buildInventoryTaskSpec,
  buildLinkedInProfilePlan,
  linkedinIdempotencyKey,
  linkedinProfileIdempotencyKey,
} from "./linkedinQueue";
import type { LinkedInOwner } from "../linkedin/types";

const owner: LinkedInOwner = { type: "admin", id: "admin-1", organizationId: "org-1" };
const sessionId = "44444444-4444-4444-8444-444444444444";

describe("LinkedIn queue plan", () => {
  it("produces stable idempotency keys for the whole session lifecycle", () => {
    expect(linkedinIdempotencyKey(sessionId, "inventory")).toBe(`linkedin:${sessionId}:inventory`);
    expect(linkedinIdempotencyKey(sessionId, "finalize")).toBe(`linkedin:${sessionId}:finalize`);
    const first = linkedinProfileIdempotencyKey(sessionId, "https://www.linkedin.com/in/ada");
    expect(first).toBe(linkedinProfileIdempotencyKey(sessionId, "https://www.linkedin.com/in/ada"));
    expect(first).toMatch(new RegExp(`^linkedin:${sessionId}:profile:[0-9a-f]{16}$`));
    expect(first).not.toBe(linkedinProfileIdempotencyKey(sessionId, "https://www.linkedin.com/in/ben"));
  });

  it("keeps the inventory task within the queue timeout ceiling", () => {
    const spec = buildInventoryTaskSpec(sessionId, owner, 600000);
    expect(spec.taskType).toBe("linkedin_inventory");
    expect(spec.timeoutSeconds).toBe(900);
    expect(buildInventoryTaskSpec(sessionId, owner, 100000000).timeoutSeconds).toBe(3600);
    expect(spec.payload).toEqual({ sessionId, owner });
  });

  it("deduplicates repeated profile URLs and plans one finalize task", () => {
    const plan = buildLinkedInProfilePlan(sessionId, owner, [
      "https://www.linkedin.com/in/ada",
      "https://www.linkedin.com/in/ada",
      "https://www.linkedin.com/in/ben",
    ]);
    expect(plan.profiles).toHaveLength(2);
    expect(plan.profiles.map((spec) => spec.payload.profileUrl)).toEqual([
      "https://www.linkedin.com/in/ada",
      "https://www.linkedin.com/in/ben",
    ]);
    expect(plan.finalize.taskType).toBe("linkedin_finalize");
    expect(plan.finalize.idempotencyKey).toBe(`linkedin:${sessionId}:finalize`);
  });

  it("never places secrets in queue payloads", () => {
    const plan = buildLinkedInProfilePlan(sessionId, owner, ["https://www.linkedin.com/in/ada"]);
    const serialized = JSON.stringify([buildInventoryTaskSpec(sessionId, owner, 600000), ...plan.profiles, plan.finalize]);
    expect(serialized).not.toMatch(/"(token|cookie|password|authorization|providerSessionReference)"|browserless|enc:v1/i);
  });
});
