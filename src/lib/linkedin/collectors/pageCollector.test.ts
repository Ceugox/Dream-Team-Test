import { describe, expect, it, vi } from "vitest";
import { collectConnectionInventory, collectProfessionalProfile, type RemotePage } from "./pageCollector";

type Action = { kind: string };

function fakePage(responses: Record<string, unknown[] | unknown> = {}) {
  const calls: Action[] = [];
  let navigations = 0;
  let concurrentNavigations = 0;
  let maximumConcurrentNavigations = 0;
  const pop = (key: string) => {
    const response = responses[key];
    return Array.isArray(response) ? response.shift() : response;
  };
  const page: RemotePage = {
    url: () => "https://www.linkedin.com/mynetwork/invite-connect/connections/",
    evaluate: vi.fn(async (_fn, action: Action) => {
      calls.push(action);
      return pop(action.kind) as never;
    }),
    goto: vi.fn(async () => {
      navigations += 1;
      concurrentNavigations += 1;
      maximumConcurrentNavigations = Math.max(maximumConcurrentNavigations, concurrentNavigations);
      await Promise.resolve();
      concurrentNavigations -= 1;
    }),
  };
  return { calls, page, navigationCount: () => navigations, maxConcurrent: () => maximumConcurrentNavigations };
}

const clear = { kind: "page-signal", stop: null };
const entry = { name: "Ada Example", headline: "Product leader", url: "https://www.linkedin.com/in/ada-example" };
const profile = { name: "Ada Example", roles: [{ title: "Product leader", company: "Example", startDate: "2024" }] };

describe("LinkedIn page collector", () => {
  it("collects inventory incrementally with bounded scrolling and injected delay", async () => {
    const remote = fakePage({ "page-signal": [clear, clear, clear, clear], "inventory-dom": [[entry], [entry]], scroll: [null] });
    const delay = vi.fn(async () => undefined);
    const result = await collectConnectionInventory(remote.page, { maxScrolls: 1, delay, delayMs: 5 });
    expect(result.status).toBe("complete");
    if (result.status === "complete") expect(result.entries).toHaveLength(1);
    expect(remote.calls.filter(({ kind }) => kind === "scroll")).toHaveLength(1);
    expect(delay).toHaveBeenCalledWith(5);
  });

  it.each(["checkpoint", "captcha", "rate_limit"] as const)("stops safely when LinkedIn presents %s", async (reason) => {
    const remote = fakePage({ "page-signal": [{ kind: "page-signal", stop: reason }] });
    await expect(collectConnectionInventory(remote.page)).resolves.toEqual({ status: "stopped", reason });
  });

  it("does not navigate more than one profile at a time", async () => {
    const remote = fakePage({ "page-signal": [clear, clear, clear, clear], "profile-dom": [profile, profile] });
    await Promise.all([
      collectProfessionalProfile(remote.page, "https://www.linkedin.com/in/ada-example"),
      collectProfessionalProfile(remote.page, "https://www.linkedin.com/in/ben-example"),
    ]);
    expect(remote.navigationCount()).toBe(2);
    expect(remote.maxConcurrent()).toBe(1);
  });

  it("honors cancellation before navigating", async () => {
    const controller = new AbortController();
    controller.abort();
    const remote = fakePage();
    await expect(collectProfessionalProfile(remote.page, "https://www.linkedin.com/in/ada-example", { signal: controller.signal }))
      .resolves.toEqual({ status: "stopped", reason: "aborted" });
    expect(remote.navigationCount()).toBe(0);
  });
});
