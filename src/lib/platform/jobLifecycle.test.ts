import { describe, expect, it } from "vitest";
import { canTransitionJob, jobStatusLabel } from "./jobLifecycle";

describe("job lifecycle", () => {
  it("allows the primary recruiting funnel", () => {
    expect(canTransitionJob("draft", "open")).toBe(true);
    expect(canTransitionJob("open", "screening")).toBe(true);
    expect(canTransitionJob("screening", "interviewing")).toBe(true);
    expect(canTransitionJob("interviewing", "offer")).toBe(true);
    expect(canTransitionJob("offer", "filled")).toBe(true);
  });

  it("protects terminal stages", () => {
    expect(canTransitionJob("filled", "open")).toBe(false);
    expect(canTransitionJob("cancelled", "draft")).toBe(false);
  });

  it("exposes labels for every stage", () => {
    expect(jobStatusLabel("paused")).toBe("Pausada");
    expect(jobStatusLabel("interviewing")).toBe("Entrevistas");
  });
});
