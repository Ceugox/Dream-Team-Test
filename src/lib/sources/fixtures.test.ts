import { expect, test } from "vitest";
import { GmailSource, ContactsSource, CalendarSource } from "./fixtures";

test("GmailSource emits people tagged with gmail source and raw email counts", async () => {
  const people = [];
  for await (const p of new GmailSource().discoverPeople()) people.push(p);
  expect(people.length).toBeGreaterThan(0);
  const bruno = people.find((p) => p.name === "Bruno Carvalho");
  expect(bruno?.sources).toEqual(["gmail"]);
  expect(bruno?.relationship?.emailsSent).toBe(14);
  expect(bruno?.emails).toEqual(["bruno.carvalho@gmail.com"]);
  expect(bruno?.linkedinUrl).toBe("https://linkedin.com/in/bruno-carvalho");
});

test("CalendarSource emits people with meeting counts", async () => {
  const people = [];
  for await (const p of new CalendarSource().discoverPeople()) people.push(p);
  const bruno = people.find((p) => p.name === "Bruno Carvalho");
  expect(bruno?.relationship?.meetings).toBe(5);
  expect(bruno?.linkedinUrl).toBe("https://linkedin.com/in/bruno-carvalho");
});

test("ContactsSource emits people with phone numbers when present", async () => {
  const people = [];
  for await (const p of new ContactsSource().discoverPeople()) people.push(p);
  const bruno = people.find((p) => p.name === "Bruno Carvalho");
  expect(bruno?.phones).toEqual(["+55 11 90000-0001"]);
  expect(bruno?.linkedinUrl).toBe("https://linkedin.com/in/bruno-carvalho");
});
