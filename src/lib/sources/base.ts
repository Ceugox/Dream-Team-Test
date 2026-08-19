import type { Person } from "../domain/person";
import type { SourceName, SourceState } from "../domain/events";

export interface NetworkSource {
  name: SourceName;
  discoverPeople(): AsyncGenerator<Person>;
}

export interface SourceRunResult {
  name: SourceName;
  state: SourceState;
  peopleCount: number;
  error?: string;
}

export async function runSource(
  source: NetworkSource,
  onPerson: (person: Person) => void
): Promise<SourceRunResult> {
  let peopleCount = 0;
  try {
    for await (const person of source.discoverPeople()) {
      onPerson(person);
      peopleCount += 1;
    }
    return { name: source.name, state: "completed", peopleCount };
  } catch (err) {
    return {
      name: source.name,
      state: "failed",
      peopleCount,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
