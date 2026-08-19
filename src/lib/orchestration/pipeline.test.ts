import { expect, test } from "vitest";
import { createPerson, type Person } from "../domain/person";
import type { NetworkSource } from "../sources/base";
import { runPipeline } from "./pipeline";

class TwoPersonSource implements NetworkSource {
  name = "linkedin" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    yield createPerson({ id: "1", name: "Bruno Carvalho", headline: "Senior Backend Engineer at Nubank", linkedinUrl: "https://linkedin.com/in/bruno" });
    yield createPerson({ id: "2", name: "Carla Nogueira", headline: "Product Manager at iFood" });
  }
}

class DuplicateSource implements NetworkSource {
  name = "gmail" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    yield createPerson({ id: "3", name: "Bruno C.", linkedinUrl: "https://linkedin.com/in/bruno", emails: ["bruno@gmail.com"] });
  }
}

class FailingSource implements NetworkSource {
  name = "calendar" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    throw new Error("calendar unavailable");
  }
}

test("pipeline discovers, merges duplicates, enriches, and completes even with a failing source", async () => {
  const pipeline = runPipeline([new TwoPersonSource(), new DuplicateSource(), new FailingSource()]);
  const events = [];
  for await (const event of pipeline) events.push(event);

  const discovered = events.filter((e) => e.type === "network.person_discovered");
  expect(discovered.length).toBe(3);

  const merged = events.filter((e) => e.type === "network.person_merged");
  expect(merged.length).toBe(1);

  const sourceStatuses = events.filter((e) => e.type === "source.status");
  const calendarStatus = sourceStatuses.filter((e) => e.type === "source.status" && e.source === "calendar");
  expect(calendarStatus.some((e) => e.type === "source.status" && e.state === "failed")).toBe(true);

  const completed = events.find((e) => e.type === "network.completed");
  expect(completed).toBeDefined();

  const metrics = events.filter((e) => e.type === "network.metrics_updated").at(-1);
  expect(metrics?.type).toBe("network.metrics_updated");
  if (metrics?.type === "network.metrics_updated") {
    expect(metrics.uniquePeople).toBe(2);
  }
});
