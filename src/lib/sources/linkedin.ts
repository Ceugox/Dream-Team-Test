import { z } from "zod";
import { createPerson, type Person } from "../domain/person";
import type { NetworkSource } from "./base";
import type { LinkedInConnectionRaw } from "./demoData";

const LinkedInConnectionSchema = z.object({
  name: z.string(),
  headline: z.string(),
  profileUrl: z.string(),
  connectedOn: z.string().optional(),
});

export function parseLinkedInExport(data: unknown): LinkedInConnectionRaw[] {
  return z.array(LinkedInConnectionSchema).parse(data);
}

export class LinkedInSource implements NetworkSource {
  name = "linkedin" as const;

  constructor(private connections: LinkedInConnectionRaw[]) {}

  async *discoverPeople(): AsyncGenerator<Person> {
    for (const conn of this.connections) {
      yield createPerson({
        id: `linkedin:${conn.profileUrl}`,
        name: conn.name,
        headline: conn.headline || null,
        linkedinUrl: conn.profileUrl,
        sources: ["linkedin"],
      });
    }
  }
}
