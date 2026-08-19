import { expect, test } from "vitest";
import { LinkedInSource, parseLinkedInExport } from "./linkedin";

test("LinkedInSource yields a Person per connection with linkedin source tag", async () => {
  const source = new LinkedInSource([
    { name: "Ana Souza", headline: "Backend Engineer at Nubank", profileUrl: "https://linkedin.com/in/ana-souza" },
  ]);
  const people = [];
  for await (const p of source.discoverPeople()) people.push(p);
  expect(people).toHaveLength(1);
  expect(people[0].name).toBe("Ana Souza");
  expect(people[0].headline).toBe("Backend Engineer at Nubank");
  expect(people[0].linkedinUrl).toBe("https://linkedin.com/in/ana-souza");
  expect(people[0].sources).toEqual(["linkedin"]);
  expect(people[0].id).toBe("linkedin:https://linkedin.com/in/ana-souza");
});

test("parseLinkedInExport validates the uploaded JSON shape", () => {
  const raw = JSON.stringify([
    { name: "Ana Souza", headline: "Backend Engineer", profileUrl: "https://linkedin.com/in/ana-souza" },
  ]);
  const result = parseLinkedInExport(JSON.parse(raw));
  expect(result).toHaveLength(1);
  expect(() => parseLinkedInExport([{ name: "No profile URL" }])).toThrow();
});
