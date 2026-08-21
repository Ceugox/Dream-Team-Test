import { expect, test } from "vitest";
import { parseLinkedInExport } from "./linkedin";

test("parseLinkedInExport validates the uploaded JSON shape", () => {
  const raw = JSON.stringify([
    { name: "Ana Souza", headline: "Backend Engineer", profileUrl: "https://linkedin.com/in/ana-souza" },
  ]);
  const result = parseLinkedInExport(JSON.parse(raw));
  expect(result).toHaveLength(1);
  expect(() => parseLinkedInExport([{ name: "No profile URL" }])).toThrow();
});
