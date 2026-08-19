import { expect, test } from "vitest";
import type { NetworkSource } from "./base";
import { runSource } from "./base";
import { createPerson } from "../domain/person";

class FakeSource implements NetworkSource {
  name = "linkedin" as const;
  async *discoverPeople() {
    yield createPerson({ id: "1", name: "A" });
    yield createPerson({ id: "2", name: "B" });
  }
}

class FailingSource implements NetworkSource {
  name = "gmail" as const;
  async *discoverPeople(): AsyncGenerator<ReturnType<typeof createPerson>> {
    throw new Error("boom");
  }
}

test("runSource collects people and reports completed state", async () => {
  const people: string[] = [];
  const result = await runSource(new FakeSource(), (p) => people.push(p.id));
  expect(people).toEqual(["1", "2"]);
  expect(result).toEqual({ name: "linkedin", state: "completed", peopleCount: 2 });
});

test("runSource reports failed state without throwing", async () => {
  const result = await runSource(new FailingSource(), () => {});
  expect(result.name).toBe("gmail");
  expect(result.state).toBe("failed");
  expect(result.peopleCount).toBe(0);
  expect(result.error).toContain("boom");
});
