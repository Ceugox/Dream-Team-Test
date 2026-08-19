# Referral Copilot MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app (Next.js/TypeScript, single process) that lets a user upload their LinkedIn
connections (extracted via a console script, never the 48h export), map them into an enriched
`Person` registry, paste a job description, and get a ranked, explained referral shortlist —
end to end in under 5 minutes.

**Architecture:** Domain-first layering per `docs/superpowers/specs/2026-08-19-referral-copilot-mvp-design.md`:
`NetworkSource` adapters (LinkedIn real via uploaded JSON, Gmail/Contacts/Calendar as fixtures)
feed an identity-resolution + enrichment + relationship-scoring pipeline into an in-memory
`Person` registry; job matching computes `CandidateFit`/`ReferralScore` over that registry.
Orchestrator streams progress to the UI via SSE. No database, no auth, no separate backend.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Zod for schemas, Tailwind CSS for styling,
Vitest for unit tests, Node 24 (already installed, confirmed `node --version` → v24.11.1).

## Global Constraints

- No database, no login — in-memory `Person` registry + JSON fixtures only (spec §11, §13).
- No browser automation against LinkedIn; the only real source is a JSON the user exports
  themselves via a console script reading already-rendered DOM (spec §6).
- Gmail/Contacts/Calendar are real adapters behind `NetworkSource` but run on fixture data
  only — no OAuth in this MVP (spec §3, confirmed with user).
- Matching is deterministic by default; LLM is optional and only for explanation text, never
  on the critical ranking path (spec §9).
- Time budget constant: `TIME_BUDGET_MS = 290_000` (spec §7).
- Formulas are exact and must match spec §8 verbatim:
  `RelationshipScore = 0.30*frequency + 0.30*recency + 0.20*meetings + 0.15*reciprocity + 0.05*contact_signal`
  `CandidateFit = 0.35*skills + 0.25*role + 0.15*seniority + 0.15*industry + 0.10*location`
  `ReferralScore = CandidateFit * (0.7 + 0.3*RelationshipScore) * Confidence`
- Every source has a state machine: `pending | running | completed | partial | failed`; one
  source failing must never abort the pipeline (spec §11).
- `DEMO_MODE=true` runs the exact same pipeline with fixture data — never a separate fake UI.

---

## File Structure

```
src/
  lib/
    domain/
      person.ts          Person, RelationshipData, ConfidenceData (zod)
      job.ts              JobProfile (zod)
      events.ts           PipelineEvent union type for SSE
    sources/
      base.ts             NetworkSource interface + SourceStatus
      linkedin.ts          LinkedInSource (reads uploaded connections.json)
      fixtures.ts          GmailSource, ContactsSource, CalendarSource (fixture-backed)
      demoData.ts          Fixture person data + demo connections.json fallback
    identity/
      resolver.ts          resolveIdentity, mergePeople
    enrichment/
      headline.ts          parseHeadline (role/company/seniority/industry from free text)
    relationship/
      scorer.ts             computeRelationshipScore
    matching/
      jobParser.ts          parseJobDescription -> JobProfile
      candidateFit.ts        computeCandidateFit
      referralScore.ts        computeReferralScore + explain()
    orchestration/
      timeBudget.ts          TimeBudget class
      pipeline.ts             runPipeline (async generator of PipelineEvent)
    metrics/
      coverage.ts             computeCoverage, computeTimingMarks
  app/
    layout.tsx
    globals.css
    page.tsx                  Screen 1: Map my professional network
    network/page.tsx           Screen 2: Network Overview
    referrals/page.tsx          Screen 3: Referral Copilot
    api/
      network/route.ts          POST: run pipeline, stream PipelineEvent via SSE
      match/route.ts             POST: job description -> ranked referral candidates
  components/
    NetworkUploader.tsx
    SourceStatusList.tsx
    NetworkMetricsPanel.tsx
    PersonCard.tsx
    JobInput.tsx
    CandidateCard.tsx
public/
  linkedin-console-script.js    The script the user pastes into DevTools
```

Tests are colocated as `*.test.ts` next to the module they cover, run with Vitest (node env,
no DOM needed — no React component tests in this plan; UI is verified manually in-browser per
Task 14/17/19/21).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
  `tailwind.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: a runnable Next.js dev server (`npm run dev`) and a runnable test command
  (`npm test`).

- [ ] **Step 1: Scaffold Next.js app**

Run:
```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --skip-install=false
```
When prompted, accept defaults. This creates `package.json`, `tsconfig.json`,
`next.config.ts`, `tailwind.config.ts` (or `postcss.config.mjs` for Tailwind v4 — either is
fine), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`.

- [ ] **Step 2: Add Vitest**

Run:
```bash
npm install -D vitest
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Edit `package.json` scripts block to add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify dev server boots**

Run: `npm run dev -- -p 3100 &` (background) then `curl -sf http://localhost:3100 -o /dev/null && echo OK`
Expected: `OK`. Stop the dev server afterward.

- [ ] **Step 4: Verify test runner works**

Create a throwaway `src/lib/sanity.test.ts`:
```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: `1 passed`

Delete `src/lib/sanity.test.ts` after confirming.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Vitest project"
```

---

### Task 2: Domain models — `Person`, `RelationshipData`, `ConfidenceData`

**Files:**
- Create: `src/lib/domain/person.ts`
- Test: `src/lib/domain/person.test.ts`

**Interfaces:**
- Produces: `PersonSchema`, `Person` type, `RelationshipDataSchema`, `RelationshipData` type,
  `ConfidenceDataSchema`, `ConfidenceData` type, `createPerson(partial: Partial<Person> & {id: string}): Person`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domain/person.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/domain/person.test.ts`
Expected: FAIL — `Cannot find module './person'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/domain/person.ts
import { z } from "zod";

export const RelationshipDataSchema = z.object({
  emailsSent: z.number().default(0),
  emailsReceived: z.number().default(0),
  meetings: z.number().default(0),
  firstInteraction: z.string().datetime().nullable().default(null),
  lastInteraction: z.string().datetime().nullable().default(null),
  reciprocity: z.number().min(0).max(1).nullable().default(null),
  frequency: z.number().min(0).max(1).nullable().default(null),
  recency: z.number().min(0).max(1).nullable().default(null),
  contactSignal: z.number().min(0).max(1).nullable().default(null),
});
export type RelationshipData = z.infer<typeof RelationshipDataSchema>;

export const ConfidenceDataSchema = z.object({
  identity: z.number().min(0).max(1),
  company: z.number().min(0).max(1).nullable().default(null),
  role: z.number().min(0).max(1).nullable().default(null),
  overall: z.number().min(0).max(1),
});
export type ConfidenceData = z.infer<typeof ConfidenceDataSchema>;

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  linkedinUrl: z.string().nullable().default(null),
  headline: z.string().nullable().default(null),
  currentCompany: z.string().nullable().default(null),
  currentRole: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  previousCompanies: z.array(z.string()).default([]),
  education: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  relationship: RelationshipDataSchema.nullable().default(null),
  confidence: ConfidenceDataSchema.nullable().default(null),
  jobFitScore: z.number().nullable().default(null),
  relationshipScore: z.number().nullable().default(null),
  referralScore: z.number().nullable().default(null),
});
export type Person = z.infer<typeof PersonSchema>;

export function createPerson(partial: Partial<Person> & { id: string }): Person {
  return PersonSchema.parse(partial);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/domain/person.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/person.ts src/lib/domain/person.test.ts
git commit -m "feat: Person/RelationshipData/ConfidenceData domain models"
```

---

### Task 3: Domain model — `JobProfile`

**Files:**
- Create: `src/lib/domain/job.ts`
- Test: `src/lib/domain/job.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `JobProfileSchema`, `JobProfile` type.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domain/job.test.ts
import { expect, test } from "vitest";
import { JobProfileSchema } from "./job";

test("JobProfile validates minimal input with defaults", () => {
  const job = JobProfileSchema.parse({ title: "Senior Backend Engineer", description: "..." });
  expect(job.requiredSkills).toEqual([]);
  expect(job.preferredSkills).toEqual([]);
  expect(job.company).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/domain/job.test.ts`
Expected: FAIL — `Cannot find module './job'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/domain/job.ts
import { z } from "zod";

export const JobProfileSchema = z.object({
  title: z.string(),
  company: z.string().nullable().default(null),
  description: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  seniority: z.enum(["junior", "pleno", "senior", "staff", "unknown"]).default("unknown"),
  location: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
});
export type JobProfile = z.infer<typeof JobProfileSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/domain/job.test.ts`
Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/job.ts src/lib/domain/job.test.ts
git commit -m "feat: JobProfile domain model"
```

---

### Task 4: Pipeline event types

**Files:**
- Create: `src/lib/domain/events.ts`

**Interfaces:**
- Consumes: `Person` from `src/lib/domain/person.ts`.
- Produces: `PipelineEvent` union type, `SourceState` type (`"pending"|"running"|"completed"|"partial"|"failed"`).

No test — this is a pure type file (no runtime logic to assert against). Every consumer that
uses these types is exercised by its own task's tests.

- [ ] **Step 1: Write the types**

```ts
// src/lib/domain/events.ts
import type { Person } from "./person";

export type SourceState = "pending" | "running" | "completed" | "partial" | "failed";

export type SourceName = "linkedin" | "gmail" | "contacts" | "calendar";

export interface SourceStatusEvent {
  type: "source.status";
  source: SourceName;
  state: SourceState;
  message?: string;
}

export interface PersonDiscoveredEvent {
  type: "network.person_discovered";
  person: Person;
}

export interface PersonMergedEvent {
  type: "network.person_merged";
  survivorId: string;
  mergedId: string;
  matchScore: number;
  signalsUsed: string[];
}

export interface MetricsUpdatedEvent {
  type: "network.metrics_updated";
  peopleDiscovered: number;
  uniquePeople: number;
  profilesEnriched: number;
  strongRelationships: number;
  elapsedMs: number;
}

export interface PipelineCompletedEvent {
  type: "network.completed";
  elapsedMs: number;
}

export type PipelineEvent =
  | SourceStatusEvent
  | PersonDiscoveredEvent
  | PersonMergedEvent
  | MetricsUpdatedEvent
  | PipelineCompletedEvent;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/events.ts
git commit -m "feat: pipeline event types"
```

---

### Task 5: `NetworkSource` interface

**Files:**
- Create: `src/lib/sources/base.ts`
- Test: `src/lib/sources/base.test.ts`

**Interfaces:**
- Consumes: `Person` (person.ts), `SourceName`, `SourceState` (events.ts).
- Produces: `NetworkSource` interface with `name: SourceName` and
  `discoverPeople(): AsyncGenerator<Person>`, plus `SourceRunResult` type
  `{ name: SourceName; state: SourceState; peopleCount: number; error?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sources/base.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/sources/base.test.ts`
Expected: FAIL — `Cannot find module './base'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sources/base.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/sources/base.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/base.ts src/lib/sources/base.test.ts
git commit -m "feat: NetworkSource interface and runSource harness"
```

---

### Task 6: Demo fixture data

**Files:**
- Create: `src/lib/sources/demoData.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEMO_LINKEDIN_CONNECTIONS: LinkedInConnectionRaw[]` (20 realistic entries),
  `DEMO_GMAIL_SIGNALS: GmailSignalRaw[]`, `DEMO_CALENDAR_SIGNALS: CalendarSignalRaw[]`,
  `DEMO_CONTACTS: ContactRaw[]` — raw shapes matching what each real source would produce,
  consumed by Task 7 and Task 8.

- [ ] **Step 1: Write the fixture data**

```ts
// src/lib/sources/demoData.ts

export interface LinkedInConnectionRaw {
  name: string;
  headline: string;
  profileUrl: string;
  connectedOn?: string;
}

export interface GmailSignalRaw {
  name: string;
  email: string;
  emailsSent: number;
  emailsReceived: number;
  lastInteraction: string;
}

export interface CalendarSignalRaw {
  name: string;
  email: string;
  meetings: number;
  lastMeeting: string;
}

export interface ContactRaw {
  name: string;
  email?: string;
  phone?: string;
}

export const DEMO_LINKEDIN_CONNECTIONS: LinkedInConnectionRaw[] = [
  { name: "Bruno Carvalho", headline: "Senior Backend Engineer at Nubank", profileUrl: "https://linkedin.com/in/bruno-carvalho", connectedOn: "2023-04-12" },
  { name: "Carla Nogueira", headline: "Product Manager at iFood", profileUrl: "https://linkedin.com/in/carla-nogueira", connectedOn: "2022-11-02" },
  { name: "Diego Martins", headline: "Staff Software Engineer, Distributed Systems at Stone", profileUrl: "https://linkedin.com/in/diego-martins", connectedOn: "2021-06-19" },
  { name: "Elisa Ramos", headline: "Data Scientist at QuintoAndar", profileUrl: "https://linkedin.com/in/elisa-ramos", connectedOn: "2024-01-30" },
  { name: "Felipe Souza", headline: "Frontend Engineer (React) at Mercado Livre", profileUrl: "https://linkedin.com/in/felipe-souza", connectedOn: "2023-08-08" },
  { name: "Gabriela Lima", headline: "Engineering Manager at Nubank", profileUrl: "https://linkedin.com/in/gabriela-lima", connectedOn: "2020-03-15" },
  { name: "Hugo Pereira", headline: "DevOps Engineer at Loft", profileUrl: "https://linkedin.com/in/hugo-pereira", connectedOn: "2022-05-21" },
  { name: "Isabela Duarte", headline: "Backend Engineer, Python, Fintech at PagSeguro", profileUrl: "https://linkedin.com/in/isabela-duarte", connectedOn: "2023-02-14" },
  { name: "Joao Vitor Alves", headline: "Recruiter, Tech Talent at Gupy", profileUrl: "https://linkedin.com/in/joao-vitor-alves", connectedOn: "2021-09-09" },
  { name: "Karina Fontes", headline: "Senior Data Engineer at C6 Bank", profileUrl: "https://linkedin.com/in/karina-fontes", connectedOn: "2024-03-01" },
  { name: "Lucas Andrade", headline: "Backend Engineer at Nubank, ex-iFood", profileUrl: "https://linkedin.com/in/lucas-andrade", connectedOn: "2022-07-27" },
  { name: "Mariana Costa", headline: "UX Designer at Creditas", profileUrl: "https://linkedin.com/in/mariana-costa", connectedOn: "2023-10-11" },
  { name: "Nicolas Teixeira", headline: "Site Reliability Engineer at Nubank", profileUrl: "https://linkedin.com/in/nicolas-teixeira", connectedOn: "2021-12-05" },
  { name: "Olivia Barros", headline: "Head of People at Loft", profileUrl: "https://linkedin.com/in/olivia-barros", connectedOn: "2020-08-18" },
  { name: "Pedro Almeida", headline: "Backend Engineer, Java/Kotlin at Itau Unibanco", profileUrl: "https://linkedin.com/in/pedro-almeida", connectedOn: "2023-05-30" },
  { name: "Quenia Rocha", headline: "Growth Marketing at Rappi", profileUrl: "https://linkedin.com/in/quenia-rocha", connectedOn: "2022-02-08" },
  { name: "Rafael Nunes", headline: "Principal Engineer, Payments at Nubank", profileUrl: "https://linkedin.com/in/rafael-nunes", connectedOn: "2019-11-22" },
  { name: "Sofia Meireles", headline: "QA Engineer at Wildlife Studios", profileUrl: "https://linkedin.com/in/sofia-meireles", connectedOn: "2023-01-17" },
  { name: "Thiago Farias", headline: "Backend Engineer, Golang, Fintech at Neon", profileUrl: "https://linkedin.com/in/thiago-farias", connectedOn: "2022-09-14" },
  { name: "Vitoria Prado", headline: "Sales Executive at Salesforce", profileUrl: "https://linkedin.com/in/vitoria-prado", connectedOn: "2021-04-03" },
];

export const DEMO_GMAIL_SIGNALS: GmailSignalRaw[] = [
  { name: "Bruno Carvalho", email: "bruno.carvalho@gmail.com", emailsSent: 14, emailsReceived: 18, lastInteraction: "2026-07-13" },
  { name: "Gabriela Lima", email: "gabriela.lima@gmail.com", emailsSent: 6, emailsReceived: 9, lastInteraction: "2026-05-02" },
  { name: "Lucas Andrade", email: "lucas.andrade@gmail.com", emailsSent: 22, emailsReceived: 25, lastInteraction: "2026-08-01" },
  { name: "Rafael Nunes", email: "rafael.nunes@gmail.com", emailsSent: 3, emailsReceived: 2, lastInteraction: "2025-12-20" },
];

export const DEMO_CALENDAR_SIGNALS: CalendarSignalRaw[] = [
  { name: "Bruno Carvalho", email: "bruno.carvalho@gmail.com", meetings: 5, lastMeeting: "2026-07-20" },
  { name: "Lucas Andrade", email: "lucas.andrade@gmail.com", meetings: 8, lastMeeting: "2026-08-05" },
  { name: "Isabela Duarte", email: "isabela.duarte@gmail.com", meetings: 2, lastMeeting: "2026-03-11" },
];

export const DEMO_CONTACTS: ContactRaw[] = [
  { name: "Bruno Carvalho", email: "bruno.carvalho@gmail.com", phone: "+55 11 90000-0001" },
  { name: "Karina Fontes", email: "karina.fontes@gmail.com" },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sources/demoData.ts
git commit -m "feat: realistic demo fixture data for all sources"
```

---

### Task 7: `LinkedInSource`

**Files:**
- Create: `src/lib/sources/linkedin.ts`
- Test: `src/lib/sources/linkedin.test.ts`

**Interfaces:**
- Consumes: `NetworkSource` (base.ts), `createPerson` (person.ts),
  `LinkedInConnectionRaw`, `DEMO_LINKEDIN_CONNECTIONS` (demoData.ts).
- Produces: `LinkedInSource` class, constructor
  `new LinkedInSource(connections: LinkedInConnectionRaw[])`,
  `parseLinkedInExport(json: unknown): LinkedInConnectionRaw[]` (validates uploaded file shape).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sources/linkedin.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/sources/linkedin.test.ts`
Expected: FAIL — `Cannot find module './linkedin'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sources/linkedin.ts
import { z } from "zod";
import { createPerson, type Person } from "../domain/person";
import type { NetworkSource } from "./base";
import type { LinkedInConnectionRaw } from "./demoData";

const LinkedInConnectionSchema = z.object({
  name: z.string(),
  headline: z.string().optional(),
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
        headline: conn.headline ?? null,
        linkedinUrl: conn.profileUrl,
        sources: ["linkedin"],
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/sources/linkedin.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/linkedin.ts src/lib/sources/linkedin.test.ts
git commit -m "feat: LinkedInSource reads uploaded connections export"
```

---

### Task 8: Fixture-backed sources — Gmail, Contacts, Calendar

**Files:**
- Create: `src/lib/sources/fixtures.ts`
- Test: `src/lib/sources/fixtures.test.ts`

**Interfaces:**
- Consumes: `NetworkSource` (base.ts), `createPerson` (person.ts), demo fixture arrays
  (demoData.ts).
- Produces: `GmailSource`, `ContactsSource`, `CalendarSource` classes, each
  `constructor()` (no args — always fixture-backed in this MVP), each implementing
  `NetworkSource`. `GmailSource`/`CalendarSource` set `relationship` fields on the `Person`
  they emit (partial `RelationshipData`, everything else default via `createPerson`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sources/fixtures.test.ts
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
});

test("CalendarSource emits people with meeting counts", async () => {
  const people = [];
  for await (const p of new CalendarSource().discoverPeople()) people.push(p);
  const bruno = people.find((p) => p.name === "Bruno Carvalho");
  expect(bruno?.relationship?.meetings).toBe(5);
});

test("ContactsSource emits people with phone numbers when present", async () => {
  const people = [];
  for await (const p of new ContactsSource().discoverPeople()) people.push(p);
  const bruno = people.find((p) => p.name === "Bruno Carvalho");
  expect(bruno?.phones).toEqual(["+55 11 90000-0001"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/sources/fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sources/fixtures.ts
import { createPerson, type Person } from "../domain/person";
import type { NetworkSource } from "./base";
import {
  DEMO_GMAIL_SIGNALS,
  DEMO_CALENDAR_SIGNALS,
  DEMO_CONTACTS,
} from "./demoData";

export class GmailSource implements NetworkSource {
  name = "gmail" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const signal of DEMO_GMAIL_SIGNALS) {
      yield createPerson({
        id: `gmail:${signal.email}`,
        name: signal.name,
        emails: [signal.email],
        sources: ["gmail"],
        relationship: {
          emailsSent: signal.emailsSent,
          emailsReceived: signal.emailsReceived,
          meetings: 0,
          firstInteraction: null,
          lastInteraction: signal.lastInteraction,
          reciprocity: null,
          frequency: null,
          recency: null,
          contactSignal: null,
        },
      });
    }
  }
}

export class CalendarSource implements NetworkSource {
  name = "calendar" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const signal of DEMO_CALENDAR_SIGNALS) {
      yield createPerson({
        id: `calendar:${signal.email}`,
        name: signal.name,
        emails: [signal.email],
        sources: ["calendar"],
        relationship: {
          emailsSent: 0,
          emailsReceived: 0,
          meetings: signal.meetings,
          firstInteraction: null,
          lastInteraction: signal.lastMeeting,
          reciprocity: null,
          frequency: null,
          recency: null,
          contactSignal: null,
        },
      });
    }
  }
}

export class ContactsSource implements NetworkSource {
  name = "contacts" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const contact of DEMO_CONTACTS) {
      yield createPerson({
        id: `contacts:${contact.email ?? contact.name}`,
        name: contact.name,
        emails: contact.email ? [contact.email] : [],
        phones: contact.phone ? [contact.phone] : [],
        sources: ["contacts"],
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/sources/fixtures.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/fixtures.ts src/lib/sources/fixtures.test.ts
git commit -m "feat: fixture-backed Gmail/Contacts/Calendar sources"
```

---

### Task 9: Identity resolution

**Files:**
- Create: `src/lib/identity/resolver.ts`
- Test: `src/lib/identity/resolver.test.ts`

**Interfaces:**
- Consumes: `Person` (person.ts).
- Produces: `MergeDecision` type
  `{ shouldMerge: boolean; matchScore: number; signalsUsed: string[]; mergeReason: string }`,
  `resolveIdentity(a: Person, b: Person): MergeDecision`,
  `mergePeople(survivor: Person, mergedIn: Person): Person` (union of arrays, dedup,
  survivor's non-null scalars win, `sources` concatenated+deduped).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/identity/resolver.test.ts
import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { resolveIdentity, mergePeople } from "./resolver";

test("same linkedin URL merges with near-certain confidence", () => {
  const a = createPerson({ id: "1", name: "Bruno Carvalho", linkedinUrl: "https://linkedin.com/in/bruno" });
  const b = createPerson({ id: "2", name: "Bruno C.", linkedinUrl: "https://linkedin.com/in/bruno" });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(true);
  expect(decision.matchScore).toBeGreaterThanOrEqual(0.95);
  expect(decision.signalsUsed).toContain("linkedinUrl");
});

test("same email merges with near-certain confidence", () => {
  const a = createPerson({ id: "1", name: "Bruno Carvalho", emails: ["bruno@gmail.com"] });
  const b = createPerson({ id: "2", name: "Bruno", emails: ["bruno@gmail.com"] });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(true);
  expect(decision.signalsUsed).toContain("email");
});

test("same name only never merges", () => {
  const a = createPerson({ id: "1", name: "Pedro Almeida" });
  const b = createPerson({ id: "2", name: "Pedro Almeida" });
  const decision = resolveIdentity(a, b);
  expect(decision.shouldMerge).toBe(false);
  expect(decision.matchScore).toBeLessThan(0.6);
});

test("same name plus same company is a probabilistic match, not automatic", () => {
  const a = createPerson({ id: "1", name: "Pedro Almeida", currentCompany: "Itau Unibanco" });
  const b = createPerson({ id: "2", name: "Pedro Almeida", currentCompany: "Itau Unibanco" });
  const decision = resolveIdentity(a, b);
  expect(decision.matchScore).toBeGreaterThan(0.5);
  expect(decision.matchScore).toBeLessThan(0.95);
  expect(decision.signalsUsed).toContain("name+company");
});

test("mergePeople unions sources and arrays without duplicates", () => {
  const survivor = createPerson({ id: "1", name: "Bruno Carvalho", sources: ["linkedin"], skills: ["python"] });
  const mergedIn = createPerson({ id: "2", name: "Bruno C.", sources: ["gmail"], skills: ["python", "aws"], emails: ["bruno@gmail.com"] });
  const result = mergePeople(survivor, mergedIn);
  expect(result.sources.sort()).toEqual(["gmail", "linkedin"]);
  expect(result.skills.sort()).toEqual(["aws", "python"]);
  expect(result.emails).toEqual(["bruno@gmail.com"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/identity/resolver.test.ts`
Expected: FAIL — `Cannot find module './resolver'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/identity/resolver.ts
import type { Person } from "../domain/person";

export interface MergeDecision {
  shouldMerge: boolean;
  matchScore: number;
  signalsUsed: string[];
  mergeReason: string;
}

const MERGE_THRESHOLD = 0.8;

export function resolveIdentity(a: Person, b: Person): MergeDecision {
  const signalsUsed: string[] = [];
  let matchScore = 0;

  if (a.linkedinUrl && b.linkedinUrl && a.linkedinUrl === b.linkedinUrl) {
    signalsUsed.push("linkedinUrl");
    matchScore = Math.max(matchScore, 0.99);
  }

  const sharedEmail = a.emails.find((e) => b.emails.includes(e));
  if (sharedEmail) {
    signalsUsed.push("email");
    matchScore = Math.max(matchScore, 0.98);
  }

  const sharedPhone = a.phones.find((p) => b.phones.includes(p));
  if (sharedPhone) {
    signalsUsed.push("phone");
    matchScore = Math.max(matchScore, 0.97);
  }

  const sameName = !!a.name && !!b.name && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

  if (signalsUsed.length === 0 && sameName && a.currentCompany && a.currentCompany === b.currentCompany) {
    signalsUsed.push("name+company");
    matchScore = Math.max(matchScore, 0.7);
  }

  if (signalsUsed.length === 0 && sameName) {
    // Name alone is never sufficient — explicitly scored below the merge threshold.
    signalsUsed.push("name");
    matchScore = Math.max(matchScore, 0.3);
  }

  const shouldMerge = matchScore >= MERGE_THRESHOLD;
  const mergeReason = shouldMerge
    ? `Merged on signals: ${signalsUsed.join(", ")} (score ${matchScore.toFixed(2)})`
    : `Not merged — highest signal was ${signalsUsed[0] ?? "none"} (score ${matchScore.toFixed(2)}, below threshold ${MERGE_THRESHOLD})`;

  return { shouldMerge, matchScore, signalsUsed, mergeReason };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function mergePeople(survivor: Person, mergedIn: Person): Person {
  return {
    ...survivor,
    name: survivor.name ?? mergedIn.name,
    emails: dedupeStrings([...survivor.emails, ...mergedIn.emails]),
    phones: dedupeStrings([...survivor.phones, ...mergedIn.phones]),
    linkedinUrl: survivor.linkedinUrl ?? mergedIn.linkedinUrl,
    headline: survivor.headline ?? mergedIn.headline,
    currentCompany: survivor.currentCompany ?? mergedIn.currentCompany,
    currentRole: survivor.currentRole ?? mergedIn.currentRole,
    location: survivor.location ?? mergedIn.location,
    previousCompanies: dedupeStrings([...survivor.previousCompanies, ...mergedIn.previousCompanies]),
    education: dedupeStrings([...survivor.education, ...mergedIn.education]),
    skills: dedupeStrings([...survivor.skills, ...mergedIn.skills]),
    sources: dedupeStrings([...survivor.sources, ...mergedIn.sources]),
    relationship: survivor.relationship ?? mergedIn.relationship,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/identity/resolver.test.ts`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/resolver.ts src/lib/identity/resolver.test.ts
git commit -m "feat: identity resolution with weighted signals, never merge on name alone"
```

---

### Task 10: Headline enrichment parser

**Files:**
- Create: `src/lib/enrichment/headline.ts`
- Test: `src/lib/enrichment/headline.test.ts`

**Interfaces:**
- Consumes: nothing (pure string parsing).
- Produces:
  `parseHeadline(headline: string | null): { role: string | null; company: string | null; seniority: "junior"|"pleno"|"senior"|"staff"|"unknown"; industryKeywords: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/enrichment/headline.test.ts
import { expect, test } from "vitest";
import { parseHeadline } from "./headline";

test("parses role and company from a standard '<role> at <company>' headline", () => {
  const result = parseHeadline("Senior Backend Engineer at Nubank");
  expect(result.role).toBe("Senior Backend Engineer");
  expect(result.company).toBe("Nubank");
  expect(result.seniority).toBe("senior");
});

test("detects staff/principal seniority", () => {
  expect(parseHeadline("Staff Software Engineer, Distributed Systems at Stone").seniority).toBe("staff");
  expect(parseHeadline("Principal Engineer, Payments at Nubank").seniority).toBe("staff");
});

test("detects junior seniority", () => {
  expect(parseHeadline("Junior Data Analyst at XP Inc").seniority).toBe("junior");
});

test("defaults to unknown seniority when no keyword present", () => {
  expect(parseHeadline("Backend Engineer at Nubank").seniority).toBe("unknown");
});

test("extracts industry keywords from free text", () => {
  const result = parseHeadline("Backend Engineer, Python, Fintech at PagSeguro");
  expect(result.industryKeywords).toContain("fintech");
});

test("handles null headline gracefully", () => {
  const result = parseHeadline(null);
  expect(result).toEqual({ role: null, company: null, seniority: "unknown", industryKeywords: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/enrichment/headline.test.ts`
Expected: FAIL — `Cannot find module './headline'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/enrichment/headline.ts

export type Seniority = "junior" | "pleno" | "senior" | "staff" | "unknown";

export interface ParsedHeadline {
  role: string | null;
  company: string | null;
  seniority: Seniority;
  industryKeywords: string[];
}

const SENIORITY_KEYWORDS: Array<[RegExp, Seniority]> = [
  [/\b(staff|principal|head of|distinguished)\b/i, "staff"],
  [/\b(senior|sr\.?)\b/i, "senior"],
  [/\b(pleno|mid-level)\b/i, "pleno"],
  [/\b(junior|jr\.?|intern|estagiario)\b/i, "junior"],
];

const INDUSTRY_KEYWORDS = [
  "fintech",
  "healthtech",
  "edtech",
  "e-commerce",
  "logistics",
  "payments",
  "banking",
  "insurtech",
];

export function parseHeadline(headline: string | null): ParsedHeadline {
  if (!headline) {
    return { role: null, company: null, seniority: "unknown", industryKeywords: [] };
  }

  const [beforeAt, afterAt] = splitOnAt(headline);
  const role = beforeAt?.trim() || null;
  const company = afterAt?.trim() || null;

  let seniority: Seniority = "unknown";
  for (const [pattern, level] of SENIORITY_KEYWORDS) {
    if (pattern.test(headline)) {
      seniority = level;
      break;
    }
  }

  const lower = headline.toLowerCase();
  const industryKeywords = INDUSTRY_KEYWORDS.filter((kw) => lower.includes(kw));

  return { role, company, seniority, industryKeywords };
}

function splitOnAt(headline: string): [string | null, string | null] {
  const idx = headline.toLowerCase().lastIndexOf(" at ");
  if (idx === -1) return [headline, null];
  return [headline.slice(0, idx), headline.slice(idx + 4)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/enrichment/headline.test.ts`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrichment/headline.ts src/lib/enrichment/headline.test.ts
git commit -m "feat: heuristic headline parser (role/company/seniority/industry)"
```

---

### Task 11: Relationship scoring

**Files:**
- Create: `src/lib/relationship/scorer.ts`
- Test: `src/lib/relationship/scorer.test.ts`

**Interfaces:**
- Consumes: `RelationshipData` (person.ts).
- Produces: `computeRelationshipScore(data: RelationshipData | null, now?: Date): number`
  (0..1, implements the exact spec formula).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/relationship/scorer.test.ts
import { expect, test } from "vitest";
import { computeRelationshipScore } from "./scorer";

test("null relationship data scores 0", () => {
  expect(computeRelationshipScore(null)).toBe(0);
});

test("stronger recency and frequency yields a higher score", () => {
  const now = new Date("2026-08-19T00:00:00Z");
  const weak = computeRelationshipScore(
    { emailsSent: 1, emailsReceived: 0, meetings: 0, firstInteraction: null, lastInteraction: "2024-01-01T00:00:00Z", reciprocity: null, frequency: null, recency: null, contactSignal: null },
    now
  );
  const strong = computeRelationshipScore(
    { emailsSent: 20, emailsReceived: 22, meetings: 8, firstInteraction: null, lastInteraction: "2026-08-05T00:00:00Z", reciprocity: null, frequency: null, recency: null, contactSignal: null },
    now
  );
  expect(strong).toBeGreaterThan(weak);
});

test("score is always within [0,1]", () => {
  const now = new Date("2026-08-19T00:00:00Z");
  const score = computeRelationshipScore(
    { emailsSent: 500, emailsReceived: 500, meetings: 500, firstInteraction: null, lastInteraction: "2026-08-19T00:00:00Z", reciprocity: 1, frequency: 1, recency: 1, contactSignal: 1 },
    now
  );
  expect(score).toBeLessThanOrEqual(1);
  expect(score).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/relationship/scorer.test.ts`
Expected: FAIL — `Cannot find module './scorer'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/relationship/scorer.ts
import type { RelationshipData } from "../domain/person";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeCount(count: number, saturationPoint: number): number {
  return clamp01(count / saturationPoint);
}

function normalizeRecency(lastInteraction: string | null, now: Date): number {
  if (!lastInteraction) return 0;
  const days = (now.getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return 1;
  // Full score at 0 days, decays to 0 by 365 days.
  return clamp01(1 - days / 365);
}

export function computeRelationshipScore(data: RelationshipData | null, now: Date = new Date()): number {
  if (!data) return 0;

  const frequency = data.frequency ?? normalizeCount(data.emailsSent + data.emailsReceived, 30);
  const recency = data.recency ?? normalizeRecency(data.lastInteraction, now);
  const meetings = normalizeCount(data.meetings, 10);
  const totalEmails = data.emailsSent + data.emailsReceived;
  const reciprocity =
    data.reciprocity ?? (totalEmails > 0 ? clamp01(1 - Math.abs(data.emailsSent - data.emailsReceived) / totalEmails) : 0);
  const contactSignal = data.contactSignal ?? 0;

  const score = 0.3 * frequency + 0.3 * recency + 0.2 * meetings + 0.15 * reciprocity + 0.05 * contactSignal;
  return clamp01(score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/relationship/scorer.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/relationship/scorer.ts src/lib/relationship/scorer.test.ts
git commit -m "feat: relationship scoring per spec formula"
```

---

### Task 12: Job description parser

**Files:**
- Create: `src/lib/matching/jobParser.ts`
- Test: `src/lib/matching/jobParser.test.ts`

**Interfaces:**
- Consumes: `JobProfile`, `JobProfileSchema` (job.ts).
- Produces: `parseJobDescription(rawText: string, titleHint?: string): JobProfile`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/matching/jobParser.test.ts
import { expect, test } from "vitest";
import { parseJobDescription } from "./jobParser";

const JD = `
Senior Backend Engineer - Nubank - Sao Paulo

We are looking for a Senior Backend Engineer to join our Payments team.
Required: Python, distributed systems, AWS.
Nice to have: Kotlin, Kafka.
Fintech experience is a big plus.
`;

test("extracts title, seniority, skills, location and industry from free text", () => {
  const job = parseJobDescription(JD);
  expect(job.title).toBe("Senior Backend Engineer");
  expect(job.seniority).toBe("senior");
  expect(job.requiredSkills.map((s) => s.toLowerCase())).toEqual(
    expect.arrayContaining(["python", "distributed systems", "aws"])
  );
  expect(job.preferredSkills.map((s) => s.toLowerCase())).toEqual(
    expect.arrayContaining(["kotlin", "kafka"])
  );
  expect(job.location).toBe("Sao Paulo");
  expect(job.industry).toBe("fintech");
});

test("falls back to titleHint when the text has no clear title line", () => {
  const job = parseJobDescription("Just some loose text about Python and AWS.", "Backend Engineer");
  expect(job.title).toBe("Backend Engineer");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/matching/jobParser.test.ts`
Expected: FAIL — `Cannot find module './jobParser'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/matching/jobParser.ts
import { JobProfileSchema, type JobProfile } from "../domain/job";

const SENIORITY_KEYWORDS: Array<[RegExp, JobProfile["seniority"]]> = [
  [/\b(staff|principal)\b/i, "staff"],
  [/\bsenior\b/i, "senior"],
  [/\bpleno\b/i, "pleno"],
  [/\bjunior\b/i, "junior"],
];

const KNOWN_SKILLS = [
  "python",
  "kotlin",
  "java",
  "go",
  "golang",
  "typescript",
  "javascript",
  "react",
  "aws",
  "gcp",
  "azure",
  "kafka",
  "distributed systems",
  "kubernetes",
  "sql",
];

const INDUSTRY_KEYWORDS = ["fintech", "healthtech", "edtech", "e-commerce", "logistics", "payments", "banking"];

function extractSkillsFromLine(line: string): string[] {
  const lower = line.toLowerCase();
  return KNOWN_SKILLS.filter((skill) => lower.includes(skill));
}

export function parseJobDescription(rawText: string, titleHint?: string): JobProfile {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines[0] ?? "";
  const titleParts = titleLine.split(" - ").map((p) => p.trim());
  const title = titleParts[0] || titleHint || "Unknown role";
  const company = titleParts[1] ?? null;
  const location = titleParts[2] ?? null;

  let seniority: JobProfile["seniority"] = "unknown";
  for (const [pattern, level] of SENIORITY_KEYWORDS) {
    if (pattern.test(rawText)) {
      seniority = level;
      break;
    }
  }

  const requiredLine = lines.find((l) => /^required:/i.test(l)) ?? "";
  const preferredLine = lines.find((l) => /^nice to have:/i.test(l)) ?? "";
  const requiredSkills = extractSkillsFromLine(requiredLine);
  const preferredSkills = extractSkillsFromLine(preferredLine).filter((s) => !requiredSkills.includes(s));

  const lower = rawText.toLowerCase();
  const industry = INDUSTRY_KEYWORDS.find((kw) => lower.includes(kw)) ?? null;

  return JobProfileSchema.parse({
    title,
    company,
    description: rawText,
    requiredSkills,
    preferredSkills,
    seniority,
    location,
    industry,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/matching/jobParser.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/jobParser.ts src/lib/matching/jobParser.test.ts
git commit -m "feat: deterministic job description parser"
```

---

### Task 13: Candidate fit + referral score

**Files:**
- Create: `src/lib/matching/candidateFit.ts`
- Create: `src/lib/matching/referralScore.ts`
- Test: `src/lib/matching/candidateFit.test.ts`
- Test: `src/lib/matching/referralScore.test.ts`

**Interfaces:**
- Consumes: `Person` (person.ts), `JobProfile` (job.ts), `parseHeadline` (headline.ts),
  `computeRelationshipScore` (scorer.ts).
- Produces:
  `computeCandidateFit(person: Person, job: JobProfile): { score: number; skillsFit: number; roleFit: number; seniorityFit: number; industryFit: number; locationFit: number }`;
  `computeReferralScore(candidateFit: number, relationshipScore: number, confidence: number): number`;
  `explainMatch(person: Person, job: JobProfile, fit: ReturnType<typeof computeCandidateFit>): string[]`
  (evidence strings built only from fields actually present on `person`/`fit`).

- [ ] **Step 1: Write the failing test for candidateFit**

```ts
// src/lib/matching/candidateFit.test.ts
import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeCandidateFit } from "./candidateFit";

const job = JobProfileSchema.parse({
  title: "Senior Backend Engineer",
  description: "...",
  requiredSkills: ["python", "aws"],
  preferredSkills: ["kotlin"],
  seniority: "senior",
  location: "Sao Paulo",
  industry: "fintech",
});

test("strong match scores high across all sub-dimensions", () => {
  const person = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    headline: "Senior Backend Engineer, Python, Fintech at Nubank",
    currentRole: "Senior Backend Engineer",
    location: "Sao Paulo",
    skills: ["python", "aws", "kotlin"],
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.skillsFit).toBeGreaterThan(0.6);
  expect(fit.seniorityFit).toBe(1);
  expect(fit.locationFit).toBe(1);
  expect(fit.score).toBeGreaterThan(0.6);
});

test("weak match scores low", () => {
  const person = createPerson({
    id: "2",
    name: "Vitoria Prado",
    headline: "Sales Executive at Salesforce",
    skills: ["salesforce", "negotiation"],
    location: "Rio de Janeiro",
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.score).toBeLessThan(0.4);
});

test("score is a weighted sum matching the spec formula", () => {
  const person = createPerson({ id: "3", name: "Test", skills: ["python"], location: "Sao Paulo" });
  const fit = computeCandidateFit(person, job);
  const expected =
    0.35 * fit.skillsFit + 0.25 * fit.roleFit + 0.15 * fit.seniorityFit + 0.15 * fit.industryFit + 0.1 * fit.locationFit;
  expect(fit.score).toBeCloseTo(expected, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/matching/candidateFit.test.ts`
Expected: FAIL — `Cannot find module './candidateFit'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/matching/candidateFit.ts
import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import { parseHeadline } from "../enrichment/headline";

export interface CandidateFitResult {
  score: number;
  skillsFit: number;
  roleFit: number;
  seniorityFit: number;
  industryFit: number;
  locationFit: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function textOverlapFit(candidateText: string | null, targetTerms: string[]): number {
  if (!candidateText || targetTerms.length === 0) return 0;
  const lower = candidateText.toLowerCase();
  const hits = targetTerms.filter((term) => lower.includes(term.toLowerCase()));
  return clamp01(hits.length / targetTerms.length);
}

export function computeCandidateFit(person: Person, job: JobProfile): CandidateFitResult {
  const parsed = parseHeadline(person.headline);
  const allSkillTerms = [...job.requiredSkills, ...job.preferredSkills];
  const skillsText = person.skills.join(" ") + " " + (person.headline ?? "");
  const requiredHits = job.requiredSkills.filter((s) => skillsText.toLowerCase().includes(s.toLowerCase()));
  const preferredHits = job.preferredSkills.filter((s) => skillsText.toLowerCase().includes(s.toLowerCase()));
  const skillsFit =
    allSkillTerms.length === 0
      ? 0
      : clamp01((requiredHits.length * 1 + preferredHits.length * 0.5) / (job.requiredSkills.length || 1));

  const roleText = person.currentRole ?? parsed.role ?? "";
  const roleFit = textOverlapFit(roleText, job.title.split(/\s+/).filter((w) => w.length > 3));

  const personSeniority = parsed.seniority;
  const seniorityFit = job.seniority === "unknown" ? 0.5 : personSeniority === job.seniority ? 1 : personSeniority === "unknown" ? 0.3 : 0.1;

  const industryFit = job.industry
    ? parsed.industryKeywords.includes(job.industry) || (person.headline ?? "").toLowerCase().includes(job.industry)
      ? 1
      : 0
    : 0.5;

  const locationFit = job.location
    ? person.location && person.location.toLowerCase().includes(job.location.toLowerCase())
      ? 1
      : 0
    : 0.5;

  const score = 0.35 * skillsFit + 0.25 * roleFit + 0.15 * seniorityFit + 0.15 * industryFit + 0.1 * locationFit;

  return { score: clamp01(score), skillsFit, roleFit, seniorityFit, industryFit, locationFit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/matching/candidateFit.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Write the failing test for referralScore**

```ts
// src/lib/matching/referralScore.test.ts
import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeReferralScore, explainMatch } from "./referralScore";
import type { CandidateFitResult } from "./candidateFit";

test("computeReferralScore matches the spec formula exactly", () => {
  const score = computeReferralScore(0.8, 0.6, 0.9);
  const expected = 0.8 * (0.7 + 0.3 * 0.6) * 0.9;
  expect(score).toBeCloseTo(expected, 5);
});

test("higher relationship score yields higher referral score for the same fit and confidence", () => {
  const low = computeReferralScore(0.7, 0.1, 1);
  const high = computeReferralScore(0.7, 0.9, 1);
  expect(high).toBeGreaterThan(low);
});

test("lower confidence penalizes referral score", () => {
  const confident = computeReferralScore(0.7, 0.5, 1);
  const unsure = computeReferralScore(0.7, 0.5, 0.4);
  expect(unsure).toBeLessThan(confident);
});

test("explainMatch only cites evidence actually present on the person", () => {
  const job = JobProfileSchema.parse({
    title: "Senior Backend Engineer",
    description: "...",
    requiredSkills: ["python"],
    seniority: "senior",
    location: "Sao Paulo",
    industry: "fintech",
  });
  const person = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    headline: "Senior Backend Engineer, Fintech at Nubank",
    skills: ["python"],
    location: "Sao Paulo",
    relationship: {
      emailsSent: 14, emailsReceived: 18, meetings: 5,
      firstInteraction: null, lastInteraction: "2026-07-20T00:00:00Z",
      reciprocity: null, frequency: null, recency: null, contactSignal: null,
    },
  });
  const fit: CandidateFitResult = { score: 0.9, skillsFit: 1, roleFit: 1, seniorityFit: 1, industryFit: 1, locationFit: 1 };
  const evidence = explainMatch(person, job, fit);
  expect(evidence.some((e) => e.toLowerCase().includes("python"))).toBe(true);
  expect(evidence.some((e) => e.toLowerCase().includes("sao paulo"))).toBe(true);
  expect(evidence.some((e) => e.includes("5") && e.toLowerCase().includes("meeting"))).toBe(true);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/lib/matching/referralScore.test.ts`
Expected: FAIL — `Cannot find module './referralScore'`

- [ ] **Step 7: Write minimal implementation**

```ts
// src/lib/matching/referralScore.ts
import type { Person } from "../domain/person";
import type { JobProfile } from "../domain/job";
import type { CandidateFitResult } from "./candidateFit";

export function computeReferralScore(candidateFit: number, relationshipScore: number, confidence: number): number {
  return candidateFit * (0.7 + 0.3 * relationshipScore) * confidence;
}

export function explainMatch(person: Person, job: JobProfile, fit: CandidateFitResult): string[] {
  const evidence: string[] = [];

  if (fit.skillsFit > 0) {
    const matched = [...job.requiredSkills, ...job.preferredSkills].filter((skill) =>
      (person.skills.join(" ") + " " + (person.headline ?? "")).toLowerCase().includes(skill.toLowerCase())
    );
    if (matched.length > 0) evidence.push(`Skills matched: ${matched.join(", ")}`);
  }

  if (fit.industryFit === 1 && job.industry) {
    evidence.push(`${job.industry[0].toUpperCase()}${job.industry.slice(1)} experience`);
  }

  if (fit.locationFit === 1 && job.location) {
    evidence.push(`Based in ${job.location}`);
  }

  if (fit.seniorityFit === 1 && job.seniority !== "unknown") {
    evidence.push(`Seniority matches: ${job.seniority}`);
  }

  const relationship = person.relationship;
  if (relationship) {
    const totalInteractions = relationship.emailsSent + relationship.emailsReceived + relationship.meetings;
    if (totalInteractions > 0) {
      evidence.push(`${totalInteractions} interactions with you`);
    }
    if (relationship.meetings > 0) {
      evidence.push(`${relationship.meetings} meetings together`);
    }
    if (relationship.lastInteraction) {
      evidence.push(`Last interaction: ${relationship.lastInteraction.slice(0, 10)}`);
    }
  }

  return evidence;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/lib/matching/referralScore.test.ts`
Expected: `4 passed`

- [ ] **Step 9: Commit**

```bash
git add src/lib/matching/candidateFit.ts src/lib/matching/candidateFit.test.ts src/lib/matching/referralScore.ts src/lib/matching/referralScore.test.ts
git commit -m "feat: candidate fit, referral score, explainable evidence"
```

---

### Task 14: Confidence scoring + person-level scoring assembly

**Files:**
- Create: `src/lib/matching/scoreRegistry.ts`
- Test: `src/lib/matching/scoreRegistry.test.ts`

**Interfaces:**
- Consumes: `Person`, `ConfidenceData` (person.ts), `JobProfile` (job.ts),
  `computeCandidateFit` (candidateFit.ts), `computeRelationshipScore` (scorer.ts),
  `computeReferralScore`, `explainMatch` (referralScore.ts).
- Produces: `computeConfidence(person: Person): ConfidenceData`,
  `rankCandidates(people: Person[], job: JobProfile): Array<Person & { referralEvidence: string[] }>`
  (sorted descending by `referralScore`, mutates and returns copies with
  `jobFitScore`/`relationshipScore`/`referralScore`/`confidence` populated).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/matching/scoreRegistry.test.ts
import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeConfidence, rankCandidates } from "./scoreRegistry";

test("computeConfidence rewards more populated fields with higher identity/overall confidence", () => {
  const sparse = createPerson({ id: "1", name: "A" });
  const rich = createPerson({
    id: "2",
    name: "B",
    linkedinUrl: "https://linkedin.com/in/b",
    headline: "Engineer at X",
    currentCompany: "X",
    currentRole: "Engineer",
    location: "SP",
    skills: ["python"],
  });
  const sparseConf = computeConfidence(sparse);
  const richConf = computeConfidence(rich);
  expect(richConf.overall).toBeGreaterThan(sparseConf.overall);
});

test("rankCandidates sorts descending by referralScore and attaches evidence", () => {
  const job = JobProfileSchema.parse({
    title: "Senior Backend Engineer",
    description: "...",
    requiredSkills: ["python"],
    seniority: "senior",
    location: "Sao Paulo",
  });
  const strong = createPerson({
    id: "1", name: "Bruno", headline: "Senior Backend Engineer, Python at Nubank", skills: ["python"], location: "Sao Paulo",
    linkedinUrl: "https://linkedin.com/in/bruno",
  });
  const weak = createPerson({ id: "2", name: "Vitoria", headline: "Sales Executive at Salesforce", location: "Rio de Janeiro" });

  const ranked = rankCandidates([weak, strong], job);
  expect(ranked[0].id).toBe("1");
  expect(ranked[0].referralScore).toBeGreaterThan(ranked[1].referralScore ?? 0);
  expect(ranked[0].referralEvidence.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/matching/scoreRegistry.test.ts`
Expected: FAIL — `Cannot find module './scoreRegistry'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/matching/scoreRegistry.ts
import type { Person, ConfidenceData } from "../domain/person";
import type { JobProfile } from "../domain/job";
import { computeCandidateFit } from "./candidateFit";
import { computeRelationshipScore } from "../relationship/scorer";
import { computeReferralScore, explainMatch } from "./referralScore";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function computeConfidence(person: Person): ConfidenceData {
  const fields = [
    person.name,
    person.linkedinUrl,
    person.headline,
    person.currentCompany,
    person.currentRole,
    person.location,
  ];
  const populated = fields.filter((f) => f !== null && f !== "").length;
  const identity = person.linkedinUrl || person.emails.length > 0 ? 0.95 : clamp01(populated / fields.length);
  const company = person.currentCompany ? 0.9 : null;
  const role = person.currentRole ? 0.9 : null;
  const overall = clamp01((identity + populated / fields.length) / 2);
  return { identity, company, role, overall };
}

export function rankCandidates(
  people: Person[],
  job: JobProfile
): Array<Person & { referralEvidence: string[] }> {
  return people
    .map((person) => {
      const fit = computeCandidateFit(person, job);
      const relationshipScore = computeRelationshipScore(person.relationship);
      const confidence = computeConfidence(person);
      const referralScore = computeReferralScore(fit.score, relationshipScore, confidence.overall);
      const referralEvidence = explainMatch(person, job, fit);
      return {
        ...person,
        jobFitScore: fit.score,
        relationshipScore,
        referralScore,
        confidence,
        referralEvidence,
      };
    })
    .sort((a, b) => (b.referralScore ?? 0) - (a.referralScore ?? 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/matching/scoreRegistry.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching/scoreRegistry.ts src/lib/matching/scoreRegistry.test.ts
git commit -m "feat: confidence scoring and candidate ranking assembly"
```

---

### Task 15: Time budget

**Files:**
- Create: `src/lib/orchestration/timeBudget.ts`
- Test: `src/lib/orchestration/timeBudget.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TimeBudget` class with `constructor(totalMs?: number, clock?: () => number)`,
  `elapsedMs(): number`, `remainingMs(): number`, `isExpired(): boolean`,
  `phase(): "bootstrap"|"discovery"|"enrichment"|"relationship"|"jobEnrichment"|"ranking"|"finalizing"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orchestration/timeBudget.test.ts
import { expect, test } from "vitest";
import { TimeBudget } from "./timeBudget";

test("defaults to the 290s spec budget", () => {
  let now = 0;
  const budget = new TimeBudget(undefined, () => now);
  expect(budget.remainingMs()).toBe(290_000);
});

test("isExpired flips true once elapsed passes the total", () => {
  let now = 0;
  const budget = new TimeBudget(1000, () => now);
  expect(budget.isExpired()).toBe(false);
  now = 1500;
  expect(budget.isExpired()).toBe(true);
});

test("phase reflects elapsed time against the spec's target windows", () => {
  let now = 0;
  const budget = new TimeBudget(290_000, () => now);
  expect(budget.phase()).toBe("bootstrap");
  now = 30_000;
  expect(budget.phase()).toBe("discovery");
  now = 90_000;
  expect(budget.phase()).toBe("enrichment");
  now = 150_000;
  expect(budget.phase()).toBe("relationship");
  now = 200_000;
  expect(budget.phase()).toBe("jobEnrichment");
  now = 260_000;
  expect(budget.phase()).toBe("ranking");
  now = 285_000;
  expect(budget.phase()).toBe("finalizing");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/orchestration/timeBudget.test.ts`
Expected: FAIL — `Cannot find module './timeBudget'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orchestration/timeBudget.ts

export const TIME_BUDGET_MS = 290_000;

export type Phase = "bootstrap" | "discovery" | "enrichment" | "relationship" | "jobEnrichment" | "ranking" | "finalizing";

export class TimeBudget {
  private startedAt: number;
  private totalMs: number;
  private clock: () => number;

  constructor(totalMs: number = TIME_BUDGET_MS, clock: () => number = () => Date.now()) {
    this.totalMs = totalMs;
    this.clock = clock;
    this.startedAt = clock();
  }

  elapsedMs(): number {
    return this.clock() - this.startedAt;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }

  isExpired(): boolean {
    return this.elapsedMs() >= this.totalMs;
  }

  phase(): Phase {
    const ratio = this.elapsedMs() / this.totalMs;
    if (ratio < 10 / 290) return "bootstrap";
    if (ratio < 60 / 290) return "discovery";
    if (ratio < 120 / 290) return "enrichment";
    if (ratio < 180 / 290) return "relationship";
    if (ratio < 240 / 290) return "jobEnrichment";
    if (ratio < 280 / 290) return "ranking";
    return "finalizing";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/orchestration/timeBudget.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestration/timeBudget.ts src/lib/orchestration/timeBudget.test.ts
git commit -m "feat: anytime-algorithm time budget with phase tracking"
```

---

### Task 16: Coverage metrics

**Files:**
- Create: `src/lib/metrics/coverage.ts`
- Test: `src/lib/metrics/coverage.test.ts`

**Interfaces:**
- Consumes: `Person` (person.ts).
- Produces:
  `computeCoverage(people: Person[]): { companyCoverage: number; roleCoverage: number; locationCoverage: number; strongRelationships: number; averageProfileCompleteness: number }`
  (strong relationship = `relationshipScore !== null && relationshipScore >= 0.5`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/metrics/coverage.test.ts
import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { computeCoverage } from "./coverage";

test("computes coverage percentages across the population", () => {
  const people = [
    createPerson({ id: "1", currentCompany: "Nubank", currentRole: "Engineer", location: "SP", relationshipScore: 0.8 }),
    createPerson({ id: "2", currentCompany: null, currentRole: "Engineer", location: null, relationshipScore: 0.2 }),
  ];
  const coverage = computeCoverage(people);
  expect(coverage.companyCoverage).toBe(0.5);
  expect(coverage.roleCoverage).toBe(1);
  expect(coverage.locationCoverage).toBe(0.5);
  expect(coverage.strongRelationships).toBe(1);
});

test("handles an empty population without dividing by zero", () => {
  const coverage = computeCoverage([]);
  expect(coverage.companyCoverage).toBe(0);
  expect(coverage.strongRelationships).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/metrics/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/metrics/coverage.ts
import type { Person } from "../domain/person";

export interface CoverageMetrics {
  companyCoverage: number;
  roleCoverage: number;
  locationCoverage: number;
  strongRelationships: number;
  averageProfileCompleteness: number;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function computeCoverage(people: Person[]): CoverageMetrics {
  const total = people.length;
  const companyCoverage = ratio(people.filter((p) => !!p.currentCompany).length, total);
  const roleCoverage = ratio(people.filter((p) => !!p.currentRole).length, total);
  const locationCoverage = ratio(people.filter((p) => !!p.location).length, total);
  const strongRelationships = people.filter((p) => (p.relationshipScore ?? 0) >= 0.5).length;

  const completenessFields: Array<keyof Person> = ["name", "linkedinUrl", "headline", "currentCompany", "currentRole", "location"];
  const averageProfileCompleteness =
    total === 0
      ? 0
      : people.reduce((sum, p) => sum + completenessFields.filter((f) => !!p[f]).length / completenessFields.length, 0) / total;

  return { companyCoverage, roleCoverage, locationCoverage, strongRelationships, averageProfileCompleteness };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/metrics/coverage.test.ts`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/metrics/coverage.ts src/lib/metrics/coverage.test.ts
git commit -m "feat: network coverage metrics"
```

---

### Task 17: Pipeline orchestrator

**Files:**
- Create: `src/lib/orchestration/pipeline.ts`
- Test: `src/lib/orchestration/pipeline.test.ts`

**Interfaces:**
- Consumes: `NetworkSource`, `runSource` (base.ts), `resolveIdentity`, `mergePeople`
  (resolver.ts), `parseHeadline` (headline.ts), `computeRelationshipScore` (scorer.ts),
  `computeCoverage` (coverage.ts), `PipelineEvent` (events.ts), `TimeBudget` (timeBudget.ts).
- Produces: `runPipeline(sources: NetworkSource[]): AsyncGenerator<PipelineEvent>` — runs all
  sources concurrently (never awaits one before starting the next), performs identity
  resolution incrementally as each person arrives, applies headline enrichment, computes
  `relationshipScore`, and emits `PipelineEvent`s throughout; ends with
  `network.completed`.

  **Post-implementation correction (review fix, applied during Task 17):** the original
  version of this task text below still shows a `getLastRegistry()`/module-level
  `lastRegistry` stash for Task 18/19 to read the final registry from. That design was
  removed after review — it attached mutable state to the `runPipeline` function object
  itself, which two overlapping requests to the future `/api/network` route could clobber.
  Task 18/19 do not need it: the SSE route streams every `PipelineEvent` to the client, and
  the client rebuilds its own `Person` registry from `network.person_discovered`/
  `network.person_merged` events (see Task 21). Do not re-add a server-side "final registry"
  accessor — if a future task genuinely needs one, it must be scoped per-call (e.g. a closure
  returned alongside the generator), never a shared/global stash.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orchestration/pipeline.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/orchestration/pipeline.test.ts`
Expected: FAIL — `Cannot find module './pipeline'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orchestration/pipeline.ts
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
    push({ type: "__done__" as never });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/orchestration/pipeline.test.ts`
Expected: `1 passed`. If the merge-count assertion fails because the duplicate source resolves
before both `TwoPersonSource` entries land, that is a real bug — fix `integratePerson` so
identity resolution always compares against the current registry snapshot (it already does;
if it still fails, check that `DuplicateSource` yields after `TwoPersonSource`'s first person
by awaiting `Promise.all` correctly — do not change the test to hide a race).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestration/pipeline.ts src/lib/orchestration/pipeline.test.ts
git commit -m "feat: concurrent pipeline orchestrator with incremental identity resolution"
```

---

### Task 18: `/api/network` route (SSE)

**Files:**
- Create: `src/app/api/network/route.ts`

**Interfaces:**
- Consumes: `runPipeline` (pipeline.ts), `LinkedInSource`, `parseLinkedInExport` (linkedin.ts),
  `GmailSource`, `ContactsSource`, `CalendarSource` (fixtures.ts), `DEMO_LINKEDIN_CONNECTIONS`
  (demoData.ts).
- Produces: `POST` handler accepting `multipart/form-data` with an optional `file` field
  (the uploaded `connections.json`); streams `text/event-stream` where each SSE `data:` line
  is `JSON.stringify(PipelineEvent)`. Falls back to `DEMO_LINKEDIN_CONNECTIONS` when no file
  is uploaded.

No unit test for this task — Route Handlers wrapping Node's `ReadableStream` are exercised by
manual verification (Step 2) rather than Vitest, consistent with the plan's UI-integration
tasks.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/network/route.ts
import { runPipeline } from "@/lib/orchestration/pipeline";
import { LinkedInSource, parseLinkedInExport } from "@/lib/sources/linkedin";
import { GmailSource, ContactsSource, CalendarSource } from "@/lib/sources/fixtures";
import { DEMO_LINKEDIN_CONNECTIONS } from "@/lib/sources/demoData";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  const demoMode = process.env.DEMO_MODE === "true";
  let connections = DEMO_LINKEDIN_CONNECTIONS;
  if (!demoMode && file instanceof File) {
    const text = await file.text();
    connections = parseLinkedInExport(JSON.parse(text));
  }

  const sources = [new LinkedInSource(connections), new GmailSource(), new ContactsSource(), new CalendarSource()];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPipeline(sources)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev -- -p 3100 &` (background), then:
```bash
curl -N -X POST -F "noop=1" http://localhost:3100/api/network | head -c 500
```
Expected: a stream of `data: {"type":"source.status",...}` lines starting to arrive
immediately (not buffered until the end). Stop the dev server afterward.

Note: the `-F "noop=1"` is required so curl sends a `Content-Type: multipart/form-data`
header — a bodyless `curl -X POST` has no Content-Type at all and `req.formData()` throws
500. A real browser `fetch(url, {body: formData})` always sets this header correctly, even
for an empty `FormData`, so this is a verification-command detail only, not a route bug
(confirmed during Task 18's review with an independent Node Fetch API reproduction).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/network/route.ts
git commit -m "feat: /api/network SSE route streaming pipeline events"
```

---

### Task 19: `/api/match` route

**Files:**
- Create: `src/app/api/match/route.ts`

**Interfaces:**
- Consumes: `parseJobDescription` (jobParser.ts), `rankCandidates` (scoreRegistry.ts),
  `Person` (person.ts).
- Produces: `POST` handler accepting JSON `{ jobDescription: string; titleHint?: string; people: Person[] }`,
  returns JSON `{ job: JobProfile; candidates: Array<Person & { referralEvidence: string[] }> }`.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/match/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { PersonSchema } from "@/lib/domain/person";
import { parseJobDescription } from "@/lib/matching/jobParser";
import { rankCandidates } from "@/lib/matching/scoreRegistry";

const RequestSchema = z.object({
  jobDescription: z.string().min(1),
  titleHint: z.string().optional(),
  people: z.array(PersonSchema),
});

export async function POST(req: Request) {
  const body = RequestSchema.parse(await req.json());
  const job = parseJobDescription(body.jobDescription, body.titleHint);
  const candidates = rankCandidates(body.people, job);
  return NextResponse.json({ job, candidates });
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev -- -p 3100 &` then:
```bash
curl -sf -X POST http://localhost:3100/api/match \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"Senior Backend Engineer\nRequired: Python, AWS","people":[{"id":"1","name":"Bruno","headline":"Senior Backend Engineer, Python at Nubank","skills":["python"],"sources":["linkedin"]}]}' | head -c 500
```
Expected: JSON with `"candidates":[{... "referralScore": <number> ...}]`. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/match/route.ts
git commit -m "feat: /api/match route for job-aware candidate ranking"
```

---

### Task 20: Console script (LinkedIn extraction)

**Files:**
- Create: `public/linkedin-console-script.js`

**Interfaces:**
- Consumes: nothing (runs standalone in the user's browser DevTools console on
  `linkedin.com/mynetwork/invite-connect/connections/`).
- Produces: downloads a `connections.json` file matching the shape validated by
  `parseLinkedInExport` in Task 7 (`{ name, headline, profileUrl, connectedOn? }[]`).

- [ ] **Step 1: Write the script**

```js
// public/linkedin-console-script.js
// Run this in the DevTools console while on
// https://www.linkedin.com/mynetwork/invite-connect/connections/
// It scrolls the page to load every connection, reads what's already
// rendered in the DOM (no network calls, no login bypass), and downloads
// a connections.json you can upload into the Referral Copilot app.

(async function extractLinkedInConnections() {
  function collectVisible() {
    const cards = document.querySelectorAll("[data-view-name='connections-list-item'], .mn-connection-card");
    const results = [];
    cards.forEach((card) => {
      const link = card.querySelector("a[href*='/in/']");
      const nameEl = card.querySelector(".mn-connection-card__name, [data-anonymize='person-name']");
      const headlineEl = card.querySelector(".mn-connection-card__occupation, [data-anonymize='headline']");
      if (!link || !nameEl) return;
      results.push({
        name: nameEl.textContent.trim(),
        headline: headlineEl ? headlineEl.textContent.trim() : "",
        profileUrl: link.href.split("?")[0],
      });
    });
    return results;
  }

  const seen = new Map();
  let stableRounds = 0;
  const MAX_STABLE_ROUNDS = 4;

  while (stableRounds < MAX_STABLE_ROUNDS) {
    const before = seen.size;
    collectVisible().forEach((person) => seen.set(person.profileUrl, person));
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (seen.size === before) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }
  }

  const connections = Array.from(seen.values());
  const blob = new Blob([JSON.stringify(connections, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "connections.json";
  a.click();
  URL.revokeObjectURL(url);

  console.log(`Extracted ${connections.length} connections -> connections.json downloaded.`);
})();
```

- [ ] **Step 2: Note the DOM-selector caveat in the script itself**

Add this comment block at the very top of the same file, above the IIFE:

```js
// NOTE: LinkedIn's DOM class names change over time and by locale. If this
// script finds 0 connections, open DevTools > Elements on one connection
// card, find the real class names for the name/headline/profile-link, and
// update the three querySelector calls below accordingly. The extraction
// LOGIC (scroll-until-stable, dedupe by profileUrl, download JSON) does not
// need to change.
```

- [ ] **Step 3: Commit**

```bash
git add public/linkedin-console-script.js
git commit -m "feat: LinkedIn console script for live connection extraction"
```

---

### Task 21: Screen 1 — Map my professional network

**Files:**
- Create: `src/components/NetworkUploader.tsx`
- Create: `src/components/SourceStatusList.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `PipelineEvent` (events.ts), `SourceName`, `SourceState` (events.ts).
- Produces: client component that POSTs to `/api/network`, reads the SSE stream, shows
  live counters and per-source status, and on `network.completed` stores the final person
  list into `sessionStorage` under key `referral-copilot:people` and navigates to `/network`.

- [ ] **Step 1: Build `SourceStatusList`**

```tsx
// src/components/SourceStatusList.tsx
"use client";

import type { SourceName, SourceState } from "@/lib/domain/events";

const LABELS: Record<SourceName, string> = {
  linkedin: "LinkedIn",
  gmail: "Gmail",
  contacts: "Contacts",
  calendar: "Calendar",
};

const SYMBOLS: Record<SourceState, string> = {
  pending: "○",
  running: "◌",
  completed: "✓",
  partial: "◐",
  failed: "✗",
};

export function SourceStatusList({ statuses }: { statuses: Record<SourceName, SourceState> }) {
  return (
    <ul className="flex gap-6 text-sm font-mono">
      {(Object.keys(LABELS) as SourceName[]).map((source) => (
        <li key={source} className="flex items-center gap-2">
          <span aria-hidden>{SYMBOLS[statuses[source] ?? "pending"]}</span>
          <span>{LABELS[source]}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Build `NetworkUploader`**

```tsx
// src/components/NetworkUploader.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SourceStatusList } from "./SourceStatusList";
import type { PipelineEvent, SourceName, SourceState } from "@/lib/domain/events";
import type { Person } from "@/lib/domain/person";

export function NetworkUploader() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<Record<SourceName, SourceState>>({
    linkedin: "pending",
    gmail: "pending",
    contacts: "pending",
    calendar: "pending",
  });
  const [metrics, setMetrics] = useState({ peopleDiscovered: 0, uniquePeople: 0, profilesEnriched: 0, strongRelationships: 0 });

  async function startMapping() {
    setRunning(true);
    const registry = new Map<string, Person>();

    const formData = new FormData();
    if (file) formData.append("file", file);

    const res = await fetch("/api/network", { method: "POST", body: formData });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event: PipelineEvent = JSON.parse(line.slice(6));

        if (event.type === "source.status") {
          setStatuses((prev) => ({ ...prev, [event.source]: event.state }));
        } else if (event.type === "network.person_discovered") {
          registry.set(event.person.id, event.person);
        } else if (event.type === "network.person_merged") {
          registry.delete(event.mergedId);
        } else if (event.type === "network.metrics_updated") {
          setMetrics(event);
        } else if (event.type === "network.completed") {
          sessionStorage.setItem("referral-copilot:people", JSON.stringify(Array.from(registry.values())));
          router.push("/network");
        }
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-16">
      <h1 className="text-3xl font-semibold">Map my professional network</h1>
      <p className="max-w-lg text-center text-sm text-neutral-500">
        Upload the connections.json you exported with the console script (see /public/linkedin-console-script.js),
        or skip this step to run on demo data.
      </p>
      <input
        type="file"
        accept="application/json"
        disabled={running}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={startMapping}
        disabled={running}
        className="rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {running ? "Mapping your professional network..." : "Map my professional network"}
      </button>

      {running && (
        <div className="flex flex-col items-center gap-4">
          <SourceStatusList statuses={statuses} />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt>People discovered</dt>
            <dd>{metrics.peopleDiscovered}</dd>
            <dt>Unique identities</dt>
            <dd>{metrics.uniquePeople}</dd>
            <dt>Profiles enriched</dt>
            <dd>{metrics.profilesEnriched}</dd>
            <dt>Strong relationships</dt>
            <dd>{metrics.strongRelationships}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page**

```tsx
// src/app/page.tsx
import { NetworkUploader } from "@/components/NetworkUploader";

export default function Home() {
  return <NetworkUploader />;
}
```

- [ ] **Step 4: Verify manually in the browser**

Run: `npm run dev -- -p 3100 &`. Open `http://localhost:3100`, click "Map my professional
network" without uploading a file (demo fallback). Confirm: source statuses flip to `✓`,
counters increase, and the browser navigates to `/network` (a 404 is expected until Task 22 —
confirm the navigation itself happens and `sessionStorage` has a `referral-copilot:people`
key with 20+ entries via DevTools > Application > Session Storage). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/NetworkUploader.tsx src/components/SourceStatusList.tsx src/app/page.tsx
git commit -m "feat: Screen 1 - map my professional network with live SSE progress"
```

---

### Task 22: Screen 2 — Network Overview

**Files:**
- Create: `src/components/PersonCard.tsx`
- Create: `src/components/NetworkMetricsPanel.tsx`
- Create: `src/app/network/page.tsx`

**Interfaces:**
- Consumes: `Person` (person.ts), `computeCoverage` (coverage.ts).
- Produces: page reading `sessionStorage["referral-copilot:people"]`, rendering coverage
  metrics, a search box (filters by name/company/role), and a `PersonCard` grid; a "Continue
  to Referral Copilot" link to `/referrals`.

- [ ] **Step 1: Build `PersonCard`**

```tsx
// src/components/PersonCard.tsx
import type { Person } from "@/lib/domain/person";

export function PersonCard({ person }: { person: Person }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="font-medium">{person.name ?? "Unknown"}</p>
      {person.headline && <p className="text-sm text-neutral-500">{person.headline}</p>}
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-neutral-400">
        {person.currentCompany && <span>{person.currentCompany}</span>}
        {person.location && <span>· {person.location}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build `NetworkMetricsPanel`**

```tsx
// src/components/NetworkMetricsPanel.tsx
import { computeCoverage } from "@/lib/metrics/coverage";
import type { Person } from "@/lib/domain/person";

export function NetworkMetricsPanel({ people }: { people: Person[] }) {
  const coverage = computeCoverage(people);
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
      <div>
        <dt className="text-neutral-500">Unique people</dt>
        <dd className="text-2xl font-semibold">{people.length}</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Company coverage</dt>
        <dd className="text-2xl font-semibold">{Math.round(coverage.companyCoverage * 100)}%</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Role coverage</dt>
        <dd className="text-2xl font-semibold">{Math.round(coverage.roleCoverage * 100)}%</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Strong relationships</dt>
        <dd className="text-2xl font-semibold">{coverage.strongRelationships}</dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 3: Build the page**

```tsx
// src/app/network/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PersonCard } from "@/components/PersonCard";
import { NetworkMetricsPanel } from "@/components/NetworkMetricsPanel";
import type { Person } from "@/lib/domain/person";

export default function NetworkPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("referral-copilot:people");
    if (raw) setPeople(JSON.parse(raw));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.currentCompany, p.currentRole, p.headline].some((f) => f?.toLowerCase().includes(q))
    );
  }, [people, query]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Professional Network</h1>
      <div className="my-6">
        <NetworkMetricsPanel people={people} />
      </div>
      <input
        placeholder="Search by name, company, or role"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 w-full rounded border border-neutral-300 px-3 py-2"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
      <Link href="/referrals" className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white">
        Continue to Referral Copilot
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually in the browser**

Run: `npm run dev -- -p 3100 &`. Repeat the Task 21 flow through to `/network`. Confirm:
metrics render non-zero values, typing in search narrows the grid, and the "Continue" link is
present. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonCard.tsx src/components/NetworkMetricsPanel.tsx src/app/network/page.tsx
git commit -m "feat: Screen 2 - network overview with coverage metrics and search"
```

---

### Task 23: Screen 3 — Referral Copilot

**Files:**
- Create: `src/components/JobInput.tsx`
- Create: `src/components/CandidateCard.tsx`
- Create: `src/app/referrals/page.tsx`

**Interfaces:**
- Consumes: `Person` (person.ts), `/api/match` (Task 19).
- Produces: page with a job-description textarea; on submit, POSTs
  `{ jobDescription, people }` (read from `sessionStorage`) to `/api/match`, renders ranked
  `CandidateCard`s with fit/relationship bars and evidence bullets.

- [ ] **Step 1: Build `CandidateCard`**

```tsx
// src/components/CandidateCard.tsx
import type { Person } from "@/lib/domain/person";

type Candidate = Person & { referralEvidence: string[] };

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-neutral-100">
        <div className="h-2 rounded bg-black" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-medium">{candidate.name}</p>
          {candidate.headline && <p className="text-sm text-neutral-500">{candidate.headline}</p>}
        </div>
        <span className="text-lg font-semibold">{Math.round((candidate.referralScore ?? 0) * 100)}%</span>
      </div>
      <div className="mt-3 space-y-2">
        <Bar label="Job fit" value={candidate.jobFitScore ?? 0} />
        <Bar label="Relationship" value={candidate.relationshipScore ?? 0} />
      </div>
      {candidate.referralEvidence.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          {candidate.referralEvidence.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build `JobInput`**

```tsx
// src/components/JobInput.tsx
"use client";

import { useState } from "react";

export function JobInput({ onSubmit, loading }: { onSubmit: (text: string) => void; loading: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a job description"
        rows={8}
        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
      />
      <button
        onClick={() => onSubmit(text)}
        disabled={loading || text.trim().length === 0}
        className="w-fit rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {loading ? "Finding referrals..." : "Find people to refer"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build the page**

```tsx
// src/app/referrals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { JobInput } from "@/components/JobInput";
import { CandidateCard } from "@/components/CandidateCard";
import type { Person } from "@/lib/domain/person";

type Candidate = Person & { referralEvidence: string[] };

export default function ReferralsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("referral-copilot:people");
    if (raw) setPeople(JSON.parse(raw));
  }, []);

  async function handleSubmit(jobDescription: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, people }),
      });
      const data = await res.json();
      setCandidates(data.candidates);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Referral Copilot</h1>
      <JobInput onSubmit={handleSubmit} loading={loading} />
      {candidates.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-medium">People you should consider referring</h2>
          <div className="space-y-4">
            {candidates.slice(0, 10).map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify manually in the browser**

Run: `npm run dev -- -p 3100 &`. Go through Screen 1 → Screen 2 → Screen 3. Paste:
```
Senior Backend Engineer - Nubank - Sao Paulo
Required: Python, distributed systems, AWS.
Fintech experience is a big plus.
```
Click "Find people to refer". Confirm candidates render sorted by score, with fit/relationship
bars and evidence bullets, and that a fintech backend profile (e.g. Bruno Carvalho / Isabela
Duarte from the demo data) ranks above unrelated profiles (e.g. Vitoria Prado, sales). Stop the
dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobInput.tsx src/components/CandidateCard.tsx src/app/referrals/page.tsx
git commit -m "feat: Screen 3 - Referral Copilot with ranked, explained candidates"
```

---

### Task 24: README

**Files:**
- Create: `README.md`
- Modify: `.gitignore` (ensure `node_modules`, `.next` are excluded — already default from
  `create-next-app`, verify only).

**Interfaces:**
- Consumes: nothing — documentation only.

- [ ] **Step 1: Write the README**

```markdown
# Referral Copilot

LinkedIn tells us who is in your professional network. Our intelligence layer tells you who
you should refer.

## Problema

Numa plataforma de indicação de vagas, quem indica não é recrutador — tem emprego próprio,
rede grande, pouco tempo. Lembrar manualmente "quem eu conheço pra essa vaga" é difícil,
e frequentemente a indicação simplesmente não acontece.

## Hipótese de produto

Se mapearmos a rede profissional do usuário e a enriquecermos com sinais de relacionamento,
o sistema pode responder proativamente "estas são as pessoas que você deveria considerar
indicar pra esta vaga, e por quê" — antes do usuário lembrar delas sozinho.

## Como rodar

\`\`\`bash
npm install
npm run dev
\`\`\`

Abra http://localhost:3000. Clique em "Map my professional network":
- **Com dados reais**: rode `public/linkedin-console-script.js` no console do DevTools em
  `linkedin.com/mynetwork/invite-connect/connections/` (você precisa estar logado — o script
  lê apenas o que já está renderizado na página, não usa o export oficial de 48h nem
  automação de browser). Isso baixa um `connections.json`; suba esse arquivo na tela inicial.
- **Sem upload**: o app roda direto em cima de dados de demonstração realistas.

## Variáveis de ambiente

| Variável | Default | Efeito |
|---|---|---|
| `DEMO_MODE` | `false` | Quando `true`, ignora qualquer `connections.json` enviado e força o LinkedIn também a rodar em fixture — útil pra demonstrar o pipeline completo sem depender de um upload ao vivo. Gmail/Contacts/Calendar já rodam em fixture sempre neste MVP (ver "O que deliberadamente não construímos"). |

## Arquitetura

\`\`\`mermaid
flowchart LR
  U[Usuário] -->|upload connections.json| UI[Next.js UI]
  UI --> API[/api/network SSE/]
  API --> Pipeline[Pipeline]
  Pipeline --> LinkedInSource
  Pipeline --> GmailSource
  Pipeline --> ContactsSource
  Pipeline --> CalendarSource
  Pipeline --> Identity[Identity Resolution]
  Identity --> Registry[(Person Registry - in memory)]
  Registry --> UI
  UI -->|paste job description| Match[/api/match/]
  Match --> Ranking[Candidate Fit + Referral Score]
  Ranking --> UI
\`\`\`

Toda fonte implementa `NetworkSource.discoverPeople(): AsyncGenerator<Person>`
(`src/lib/sources/base.ts`). O resto do pipeline — identity resolution, enrichment,
relationship scoring, matching, UI — não conhece nada específico de LinkedIn, scraping, ou
fixtures.

## Decisões técnicas

- **Next.js full-stack (TypeScript)** em vez de backend separado: um processo, uma
  linguagem, zero duplicação do modelo `Person`, Route Handlers já fazem SSE.
- **LinkedIn via script de console**, não browser automation: o próprio usuário, já logado,
  roda um script que lê o DOM renderizado — zero bypass de autenticação, zero CAPTCHA
  quebrado, zero sessão roubada. Ver `public/linkedin-console-script.js`.
- **Gmail/Contacts/Calendar são adapters reais, mas rodam em fixture** (`src/lib/sources/fixtures.ts`)
  — OAuth real ficaria fora do orçamento de tempo do desafio; a interface está pronta pra
  ligar credenciais reais depois sem tocar no resto do pipeline.
- **Matching determinístico** (`src/lib/matching/`) — sem LLM no caminho crítico, pra garantir
  que a demo funcione offline e sem custo por rodada.

## Fluxo da aplicação

1. **Map my professional network** — upload do `connections.json` (ou fallback pra demo),
   pipeline roda as 4 fontes concorrentemente, progresso ao vivo via SSE.
2. **Network Overview** — cobertura de dados (empresa/cargo/localização), busca, todas as
   pessoas.
3. **Referral Copilot** — cola a vaga, recebe candidatos rankeados por `ReferralScore`, cada
   um com evidência real do porquê.

## Modelo de ranking

\`\`\`
RelationshipScore = 0.30*frequency + 0.30*recency + 0.20*meetings + 0.15*reciprocity + 0.05*contact_signal
CandidateFit       = 0.35*skills + 0.25*role + 0.15*seniority + 0.15*industry + 0.10*location
ReferralScore      = CandidateFit * (0.7 + 0.3*RelationshipScore) * Confidence
\`\`\`

Uma pessoa levemente menos aderente à vaga, porém muito mais próxima do usuário, pode
superar em `ReferralScore` alguém "mais perfeito" no papel mas praticamente desconhecido.

## Limitações

- Sem Gmail/Calendar reais conectados, `RelationshipScore` cai pro sinal de `contact_signal`
  (ex.: conexões em comum do LinkedIn), sinalizado explicitamente como "sem dados de
  interação" — não fingimos precisão que não temos.
- Extração via console script depende da estrutura DOM atual do LinkedIn; se a LinkedIn
  mudar nomes de classe, o seletor precisa de ajuste manual (comentado no próprio arquivo).
- Sem persistência entre sessões — tudo em memória/sessionStorage, por design (o desafio não
  pede login nem banco de dados).

## What we deliberately did NOT build

- **OAuth real de Gmail/Calendar/Contacts**: adapter pronto, não ligado. Rodar OAuth real em
  ~40h de prazo, sujeito à tela de "app não verificado" do Google travando ao vivo, era mais
  risco do que valor pra uma demo de sexta-feira.
- **Backend separado (FastAPI)**: cortado por simplicidade operacional solo — um único
  processo Next.js cobre orquestração, API e UI sem duplicar o modelo de domínio.
- **Banco de dados**: o próprio desafio pede explicitamente que não seja necessário.
- **Browser automation contra o LinkedIn**: risco de detecção anti-bot e violação de ToS;
  substituído pelo script de console que o próprio usuário roda na sua sessão já logada.
- **Microservices, fila distribuída, Neo4j, Kubernetes**: escopo de produção que não serve a
  um MVP avaliado uma única vez.

## Evolução para produção

A interface `NetworkSource` já isola a aquisição de dados do resto do sistema — trocar a
fixture de Gmail/Calendar por OAuth real, adicionar PostgreSQL/pgvector, sincronização
incremental, multi-tenancy ou uma fila de background jobs não deveria exigir mudanças em
identity resolution, enrichment, scoring, matching ou UI.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with architecture, decisions, and what we deliberately did not build"
```

---

### Task 25: Test suite sanity pass + typecheck

**Files:**
- No new files — verification-only task.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass (one per module from Tasks 2, 3, 5, 7, 8, 9, 10, 11, 12, 13
(two files: candidateFit and referralScore), 14, 15, 16, 17 — 16 test files total, 0 failures).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint . --max-warnings=0`
Expected: no errors. If `create-next-app`'s default ESLint config flags something trivial
(e.g. unused import), fix it directly rather than suppressing the rule.

- [ ] **Step 4: Full manual walkthrough with DEMO data**

Run: `npm run dev -- -p 3100 &`. From a fresh browser tab, walk the entire flow start to
finish without uploading a file: Screen 1 → Screen 2 → Screen 3 → paste the Senior Backend
Engineer JD from Task 23 Step 4 → confirm ranked results render. Time the whole flow with a
stopwatch; confirm it completes in well under 5 minutes (it should take seconds, since demo
data has no real network I/O). Stop the dev server.

- [ ] **Step 5: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "fix: address lint/type issues found in full suite pass"
```
