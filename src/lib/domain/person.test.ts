import { expect, test } from "vitest";
import { createPerson, PersonSchema } from "./person";

test("createPerson fills defaults and validates", () => {
  const p = createPerson({ id: "p1", name: "Ana Souza" });
  expect(p.name).toBe("Ana Souza");
  expect(p.emails).toEqual([]);
  expect(p.sources).toEqual([]);
  expect(() => PersonSchema.parse(p)).not.toThrow();
});

test("createPerson rejects missing id", () => {
  // @ts-expect-error id is required
  expect(() => createPerson({ name: "No Id" })).toThrow();
});
