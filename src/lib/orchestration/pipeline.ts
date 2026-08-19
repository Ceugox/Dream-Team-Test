import type { Person } from "../domain/person";
import type { NetworkSource } from "../sources/base";
import { resolveIdentity, mergePeople } from "../identity/resolver";
import { parseHeadline } from "../enrichment/headline";
import { computeRelationshipScore } from "../relationship/scorer";
import type { PipelineEvent } from "../domain/events";
import { TimeBudget } from "./timeBudget";

function enrichFromHeadline(person: Person): Person {
  const parsed = parseHeadline(person.headline);
  return {
    ...person,
    currentRole: person.currentRole ?? parsed.role,
    currentCompany: person.currentCompany ?? parsed.company,
  };
}

export async function* runPipeline(sources: NetworkSource[]): AsyncGenerator<PipelineEvent> {
  const budget = new TimeBudget();
  const registry: Person[] = [];
  let discoveredCount = 0;

  const queue: PipelineEvent[] = [];
  let pendingResolvers: Array<() => void> = [];

  function push(event: PipelineEvent) {
    queue.push(event);
    pendingResolvers.forEach((r) => r());
    pendingResolvers = [];
  }

  function integratePerson(incoming: Person) {
    discoveredCount += 1;
    const enriched = enrichFromHeadline(incoming);
    push({ type: "network.person_discovered", person: enriched });

    for (const existing of registry) {
      const decision = resolveIdentity(existing, enriched);
      if (decision.shouldMerge) {
        const mergedPerson = mergePeople(existing, enriched);
        const idx = registry.indexOf(existing);
        registry[idx] = mergedPerson;
        push({
          type: "network.person_merged",
          survivorId: existing.id,
          mergedId: enriched.id,
          matchScore: decision.matchScore,
          signalsUsed: decision.signalsUsed,
        });
        return;
      }
    }
    registry.push(enriched);
  }

  const sourceRuns = sources.map(async (source) => {
    push({ type: "source.status", source: source.name, state: "running" });
    try {
      for await (const person of source.discoverPeople()) {
        integratePerson(person);
      }
      push({ type: "source.status", source: source.name, state: "completed" });
    } catch (err) {
      push({
        type: "source.status",
        source: source.name,
        state: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const allDone = Promise.all(sourceRuns).then(() => {
    // Private sentinel, not a member of the PipelineEvent union: signals the
    // consumer loop below to stop once every real event has been enqueued.
    push({ type: "__done__" } as unknown as PipelineEvent);
  });

  let finished = false;
  while (!finished) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => pendingResolvers.push(resolve));
      continue;
    }
    const event = queue.shift()!;
    if ((event as { type: string }).type === "__done__") {
      finished = true;
      break;
    }
    yield event;
  }

  await allDone;

  for (let i = 0; i < registry.length; i++) {
    registry[i] = { ...registry[i], relationshipScore: computeRelationshipScore(registry[i].relationship) };
  }

  yield {
    type: "network.metrics_updated",
    peopleDiscovered: discoveredCount,
    uniquePeople: registry.length,
    profilesEnriched: registry.filter((p) => p.currentRole || p.currentCompany).length,
    strongRelationships: registry.filter((p) => (p.relationshipScore ?? 0) >= 0.5).length,
    elapsedMs: budget.elapsedMs(),
  };

  yield { type: "network.completed", elapsedMs: budget.elapsedMs() };

  (runPipeline as unknown as { lastRegistry: Person[] }).lastRegistry = registry;
}

export function getLastRegistry(): Person[] {
  return (runPipeline as unknown as { lastRegistry?: Person[] }).lastRegistry ?? [];
}
