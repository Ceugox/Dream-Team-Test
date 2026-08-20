# Referral Copilot Secure Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the session-only MVP shell with a production-capable, passwordless, organization-aware application where an administrator can invite members and both roles land in a polished, privacy-first workspace.

**Architecture:** Keep the existing Next.js/TypeScript monorepo, add PostgreSQL through Drizzle, and use Better Auth with magic-link and organization plugins. Authentication and invitation endpoints stay in Next.js; long-running source processing is deliberately deferred to the next subsystem plan. A role-aware application shell establishes the Gemini CLI-inspired visual system without changing the existing matching engine.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Drizzle ORM/Kit, Better Auth, Resend, Zod, Vitest, Playwright.

## Global Constraints

- Never collect or store a LinkedIn username, password, cookie, or session token.
- Roles in this slice are exactly `admin` and `member`; only `admin` may create invitations.
- Every protected query and mutation must be scoped to the active organization.
- Passwordless login uses single-use, hashed magic-link tokens with a five-minute expiration.
- Invitation acceptance requires a verified session whose email matches the invitation email.
- The administrator does not gain access to a member's network data.
- Product copy defaults to PT-BR; the full PT/EN switch is delivered in the later UI hardening plan.
- Preserve the current domain, pipeline, matching modules, and their passing tests.
- Use test-first implementation and commit after each task.

---

## File Structure

```text
drizzle.config.ts                         Drizzle migration configuration
src/db/client.ts                          PostgreSQL client and Drizzle instance
src/db/schema/auth.ts                     Better Auth generated schema
src/db/schema/app.ts                      Application-owned organization settings and audit tables
src/db/schema/index.ts                    Schema barrel consumed by Drizzle and Better Auth
src/lib/env.ts                            Validated server environment
src/lib/auth/server.ts                    Better Auth server configuration and organization hooks
src/lib/auth/client.ts                    Typed browser auth client
src/lib/auth/email.ts                     Transactional email adapter
src/lib/auth/authorization.ts             Pure role/tenant authorization helpers
src/lib/auth/session.ts                   Server-side required-session helpers
src/app/api/auth/[...all]/route.ts         Better Auth route handler
src/app/(auth)/entrar/page.tsx            Passwordless sign-in
src/app/(auth)/aceitar-convite/page.tsx    Invitation acceptance
src/app/(auth)/criar-organizacao/page.tsx  First-admin organization bootstrap
src/app/(app)/layout.tsx                   Protected product shell
src/app/(app)/visao-geral/page.tsx         Role-aware landing page
src/app/(app)/equipe/page.tsx              Admin member/invitation management
src/components/app/AppShell.tsx            Navigation shell
src/components/auth/MagicLinkForm.tsx      Sign-in form
src/components/team/InviteMemberForm.tsx   Admin invitation form
src/components/team/MemberList.tsx         Members and pending invitations
src/app/globals.css                        Design tokens and global states
src/middleware.ts                          Session-aware route boundary
tests/integration/auth-tenant.test.ts       Database-backed tenant tests
tests/e2e/auth-invitation.spec.ts           Critical admin/member journey
```

---

### Task 1: Runtime dependencies and validated environment

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `src/lib/env.ts`
- Create: `src/lib/env.test.ts`

**Interfaces:**
- Consumes: process environment.
- Produces: `getServerEnv(input?: NodeJS.ProcessEnv): ServerEnv`.

- [ ] **Step 1: Write the failing environment tests**

```ts
// src/lib/env.test.ts
import { describe, expect, it } from "vitest";
import { getServerEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/referral_copilot",
  BETTER_AUTH_SECRET: "12345678901234567890123456789012",
  BETTER_AUTH_URL: "http://localhost:3000",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Referral Copilot <convites@example.com>",
};

describe("getServerEnv", () => {
  it("accepts the production contract", () => {
    expect(getServerEnv(valid).BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects a short auth secret", () => {
    expect(() => getServerEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/lib/env.test.ts`  
Expected: FAIL because `./env` does not exist.

- [ ] **Step 3: Add dependencies, scripts, environment file, and validator**

Run:

```bash
npm install better-auth drizzle-orm pg resend
npm install -D drizzle-kit @types/pg @playwright/test
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:check": "drizzle-kit check",
    "test:e2e": "playwright test"
  }
}
```

Append `!.env.example` immediately after `.env*` in `.gitignore`, then create:

```dotenv
# .env.example
DATABASE_URL=postgres://postgres:postgres@localhost:5432/referral_copilot
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
RESEND_API_KEY=re_replace_me
EMAIL_FROM=Referral Copilot <convites@example.com>
```

```ts
// src/lib/env.ts
import { z } from "zod";

const ServerEnvSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres"), "must be PostgreSQL"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function getServerEnv(input: NodeJS.ProcessEnv | Record<string, string> = process.env): ServerEnv {
  return ServerEnvSchema.parse(input);
}
```

- [ ] **Step 4: Verify the task**

Run: `npm test -- src/lib/env.test.ts`  
Expected: 2 tests pass.

Run: `npm run build`  
Expected: production build succeeds without evaluating server env during static page generation.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example src/lib/env.ts src/lib/env.test.ts
git commit -m "chore: add production runtime contracts"
```

---

### Task 2: PostgreSQL schema and migration baseline

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/db/client.ts`
- Create: `src/db/schema/app.ts`
- Create: `src/db/schema/index.ts`
- Create: `src/db/schema/app.test.ts`
- Create: `drizzle/0000_foundation.sql`

**Interfaces:**
- Consumes: `getServerEnv()`.
- Produces: `db`, `organizationSettings`, `auditEvents`, and `writeAuditEvent(input)`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
// src/db/schema/app.test.ts
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { auditEvents, organizationSettings } from "./app";

describe("application schema", () => {
  it("scopes settings and audit events by organization", () => {
    expect(getTableColumns(organizationSettings)).toHaveProperty("organizationId");
    expect(getTableColumns(auditEvents)).toHaveProperty("organizationId");
    expect(getTableColumns(auditEvents)).not.toHaveProperty("payload");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/db/schema/app.test.ts`  
Expected: FAIL because `./app` does not exist.

- [ ] **Step 3: Implement the Drizzle configuration and application tables**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

```ts
// src/db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { referralPool?: Pool };
const pool = globalForDb.referralPool ?? new Pool({ connectionString: getServerEnv().DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.referralPool = pool;

export const db = drizzle(pool, { schema });
```

```ts
// src/db/schema/app.ts
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizationSettings = pgTable("organization_settings", {
  organizationId: text("organization_id").primaryKey(),
  defaultLocale: text("default_locale").notNull().default("pt-BR"),
  rawImportRetentionHours: integer("raw_import_retention_hours").notNull().default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_org_created_idx").on(table.organizationId, table.createdAt)]);
```

```ts
// src/db/schema/index.ts
export * from "./app";
export * from "./auth";
```

Temporarily create `src/db/schema/auth.ts` with `export {};` until Task 3 generates the real auth schema.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`  
Expected: `drizzle/0000_*.sql` creates `organization_settings` and `audit_events` with the organization index.

Run: `npm test -- src/db/schema/app.test.ts`  
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts drizzle src/db
git commit -m "feat: add tenant-scoped persistence foundation"
```

---

### Task 3: Passwordless authentication, organizations, and transactional email

**Files:**
- Create: `src/lib/auth/email.ts`
- Create: `src/lib/auth/server.ts`
- Create: `src/lib/auth/client.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Replace: `src/db/schema/auth.ts`
- Create: `src/lib/auth/email.test.ts`

**Interfaces:**
- Consumes: `db`, server env, Resend.
- Produces: `auth`, `authClient`, `sendTransactionalEmail(message)`, and Better Auth HTTP handlers.

- [ ] **Step 1: Write the failing e-mail contract test**

```ts
// src/lib/auth/email.test.ts
import { describe, expect, it, vi } from "vitest";
import { createEmailSender } from "./email";

describe("createEmailSender", () => {
  it("uses a stable idempotency key and never includes secrets in content", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email_1" }, error: null });
    const sender = createEmailSender(send, "Referral Copilot <convites@example.com>");
    await sender({ to: "member@example.com", subject: "Convite", html: "<p>Acesse</p>", idempotencyKey: "invite:123" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ headers: { "Idempotency-Key": "invite:123" } }));
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/lib/auth/email.test.ts`  
Expected: FAIL because `./email` does not exist.

- [ ] **Step 3: Implement the email adapter**

```ts
// src/lib/auth/email.ts
import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";

type Message = { to: string; subject: string; html: string; idempotencyKey: string };
type Send = (input: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message: string } | null }>;

export function createEmailSender(send: Send, from: string) {
  return async (message: Message) => {
    const result = await send({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      headers: { "Idempotency-Key": message.idempotencyKey },
    });
    if (result.error) throw new Error(`Transactional email failed: ${result.error.message}`);
  };
}

export function getEmailSender() {
  const env = getServerEnv();
  const resend = new Resend(env.RESEND_API_KEY);
  return createEmailSender((input) => resend.emails.send(input as never), env.EMAIL_FROM);
}
```

- [ ] **Step 4: Configure Better Auth**

```ts
// src/lib/auth/server.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { getEmailSender } from "./email";

const env = getServerEnv();
const sendEmail = getEmailSender();

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      expiresIn: 300,
      storeToken: "hashed",
      async sendMagicLink({ email, url, token }) {
        await sendEmail({
          to: email,
          subject: "Seu acesso ao Referral Copilot",
          html: `<p>Use este link único para entrar:</p><p><a href="${url}">Entrar com segurança</a></p><p>Ele expira em 5 minutos.</p>`,
          idempotencyKey: `magic-link:${token.slice(0, 24)}`,
        });
      },
    }),
    organization({
      creatorRole: "admin",
      requireEmailVerificationOnInvitation: true,
      invitationExpiresIn: 60 * 60 * 24 * 7,
      async sendInvitationEmail(data) {
        const url = `${env.BETTER_AUTH_URL}/aceitar-convite?id=${encodeURIComponent(data.id)}`;
        await sendEmail({
          to: data.email,
          subject: `${data.inviter.user.name ?? "Sua equipe"} convidou você`,
          html: `<p>Você foi convidado para ${data.organization.name}.</p><p><a href="${url}">Aceitar convite</a></p>`,
          idempotencyKey: `organization-invite:${data.id}`,
        });
      },
    }),
  ],
});
```

```ts
// src/lib/auth/client.ts
"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient(), organizationClient()] });
```

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Generate the Better Auth schema and migration**

Run with the development environment loaded:

```bash
npx auth@latest generate --config src/lib/auth/server.ts --output src/db/schema/auth.ts --yes
npm run db:generate
npm run db:check
```

Expected: the generated schema contains user, session, account, verification, organization, member, and invitation tables; Drizzle reports a valid migration set.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/lib/auth/email.test.ts src/db/schema/app.test.ts`  
Expected: all focused tests pass.

```bash
git add src/lib/auth src/app/api/auth src/db/schema/auth.ts drizzle
git commit -m "feat: add passwordless organization authentication"
```

---

### Task 4: Tenant authorization and protected routes

**Files:**
- Create: `src/lib/auth/authorization.ts`
- Create: `src/lib/auth/authorization.test.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: Better Auth session and active organization member.
- Produces: `requireWorkspace()`, `can(action, role)`, and route protection.

- [ ] **Step 1: Write failing authorization tests**

```ts
// src/lib/auth/authorization.test.ts
import { describe, expect, it } from "vitest";
import { can } from "./authorization";

describe("can", () => {
  it("allows only admins to invite", () => {
    expect(can("member:invite", "admin")).toBe(true);
    expect(can("member:invite", "member")).toBe(false);
  });

  it("allows both roles to view their workspace", () => {
    expect(can("workspace:view", "admin")).toBe(true);
    expect(can("workspace:view", "member")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/lib/auth/authorization.test.ts`  
Expected: FAIL because `./authorization` does not exist.

- [ ] **Step 3: Implement pure authorization**

```ts
// src/lib/auth/authorization.ts
export type WorkspaceRole = "admin" | "member";
export type WorkspaceAction = "workspace:view" | "member:invite" | "job:create" | "network:manage-own";

const grants: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  admin: new Set(["workspace:view", "member:invite", "job:create"]),
  member: new Set(["workspace:view", "network:manage-own"]),
};

export function can(action: WorkspaceAction, role: WorkspaceRole): boolean {
  return grants[role].has(action);
}
```

- [ ] **Step 4: Implement required workspace context**

```ts
// src/lib/auth/session.ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";
import type { WorkspaceRole } from "./authorization";

export type WorkspaceContext = {
  user: { id: string; email: string; name: string | null };
  organizationId: string;
  role: WorkspaceRole;
};

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/entrar");

  const member = await auth.api.getActiveMember({ headers: requestHeaders });
  if (!member?.organizationId || !["admin", "member"].includes(member.role)) redirect("/aceitar-convite");

  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    organizationId: member.organizationId,
    role: member.role as WorkspaceRole,
  };
}
```

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hasSessionCookie = request.cookies.getAll().some((cookie) => cookie.name.includes("session_token"));
  if (!hasSessionCookie) return NextResponse.redirect(new URL("/entrar", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/visao-geral/:path*", "/equipe/:path*", "/vagas/:path*", "/oportunidades/:path*"] };
```

The middleware is only an early UX redirect. Every page and mutation must still call `requireWorkspace()` because cookies alone do not authorize access.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/lib/auth/authorization.test.ts`  
Expected: 2 tests pass.

Run: `npm run build`  
Expected: build succeeds and protected pages can import `requireWorkspace` only from server components/actions.

```bash
git add src/lib/auth/authorization.ts src/lib/auth/authorization.test.ts src/lib/auth/session.ts src/middleware.ts
git commit -m "feat: enforce role and tenant boundaries"
```

---

### Task 5: Gemini-inspired design system and role-aware application shell

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/lib/i18n/dictionaries.ts`
- Create: `src/components/app/AppShell.tsx`
- Create: `src/components/app/MetricCard.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/visao-geral/page.tsx`
- Create: `src/components/app/AppShell.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceContext`.
- Produces: `AppShell`, design tokens, admin/member navigation.

- [ ] **Step 1: Write the failing navigation test**

```tsx
// src/components/app/AppShell.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("does not render admin navigation for members", () => {
    const html = renderToStaticMarkup(<AppShell role="member" userName="Ana"><div>Conteúdo</div></AppShell>);
    expect(html).toContain("Oportunidades");
    expect(html).not.toContain("Equipe");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/components/app/AppShell.test.tsx`  
Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Add exact design tokens to `globals.css`**

```css
:root {
  --background: #07080b;
  --surface: #101217;
  --surface-raised: #151821;
  --border: #2a2f3a;
  --foreground: #f3f5f8;
  --muted: #969cab;
  --accent-blue: #5b8cff;
  --accent-violet: #a56cff;
  --success: #58d6a8;
  --warning: #ffcb6b;
  --danger: #ff6b7a;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
}

* { box-sizing: border-box; }
html { background: var(--background); color-scheme: dark; }
body { margin: 0; background: var(--background); color: var(--foreground); font-family: Arial, Helvetica, sans-serif; }
button, input, textarea, select { font: inherit; }
:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
```

- [ ] **Step 4: Implement role-aware shell**

```tsx
// src/components/app/AppShell.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceRole } from "@/lib/auth/authorization";

const nav = {
  admin: [["/visao-geral", "Visão geral"], ["/vagas", "Vagas"], ["/equipe", "Equipe"], ["/indicacoes", "Indicações"]],
  member: [["/visao-geral", "Início"], ["/oportunidades", "Oportunidades"], ["/minha-rede", "Minha rede"], ["/conexoes", "Conexões"]],
} as const;

export function AppShell({ role, userName, children }: { role: WorkspaceRole; userName: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-16 items-center justify-between border-b border-[var(--border)] px-6">
        <Link href="/visao-geral" className="font-semibold">›_ Referral Copilot</Link>
        <span className="text-sm text-[var(--muted)]">{userName ?? "Minha conta"}</span>
      </header>
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[220px_1fr]">
        <nav aria-label="Principal" className="border-r border-[var(--border)] p-4">
          {nav[role].map(([href, label]) => <Link key={href} href={href} className="mb-1 block rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-white">{label}</Link>)}
        </nav>
        <main className="min-w-0 p-8">{children}</main>
      </div>
    </div>
  );
}
```

```tsx
// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { requireWorkspace } from "@/lib/auth/session";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const workspace = await requireWorkspace();
  return <AppShell role={workspace.role} userName={workspace.user.name}>{children}</AppShell>;
}
```

- [ ] **Step 5: Build the role-aware overview**

The admin page renders a real empty state for team activation; the member page renders onboarding progress. No fixture metrics appear outside explicit demo mode.

```tsx
// src/app/(app)/visao-geral/page.tsx
import { requireWorkspace } from "@/lib/auth/session";

export default async function OverviewPage() {
  const { role, user } = await requireWorkspace();
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent-blue)]">{role === "admin" ? "Workspace administrativo" : "Sua rede privada"}</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">Olá, {user.name ?? user.email.split("@")[0]}.</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">{role === "admin" ? "Ative sua equipe e transforme redes profissionais em indicações consentidas." : "Conecte suas fontes e receba oportunidades relevantes sem expor sua rede."}</p>
    </section>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/components/app/AppShell.test.tsx`  
Expected: navigation test passes.

Run: `npm run build`  
Expected: build passes and no protected page is statically prerendered without a session.

```bash
git add src/app src/components/app
git commit -m "feat: introduce referral copilot product shell"
```

---

### Task 6: Passwordless entry, organization bootstrap, and invitation acceptance

**Files:**
- Create: `src/components/auth/MagicLinkForm.tsx`
- Create: `src/app/(auth)/entrar/page.tsx`
- Create: `src/app/(auth)/aceitar-convite/page.tsx`
- Create: `src/app/(auth)/criar-organizacao/page.tsx`
- Create: `src/components/auth/MagicLinkForm.test.tsx`

**Interfaces:**
- Consumes: `authClient.signIn.magicLink`, `authClient.organization.acceptInvitation`.
- Produces: complete first-admin and invited-user entry flows.

- [ ] **Step 1: Write a failing rendered-state test**

```tsx
// src/components/auth/MagicLinkForm.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MagicLinkForm } from "./MagicLinkForm";

describe("MagicLinkForm", () => {
  it("explains passwordless access", () => {
    const html = renderToStaticMarkup(<MagicLinkForm />);
    expect(html).toContain("link seguro");
    expect(html).not.toContain("Senha");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/components/auth/MagicLinkForm.test.tsx`  
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the form and auth pages**

```tsx
// src/components/auth/MagicLinkForm.tsx
"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const result = await authClient.signIn.magicLink({ email, callbackURL: "/visao-geral", errorCallbackURL: "/entrar?erro=link" });
    setState(result.error ? "error" : "sent");
  }

  return <form onSubmit={submit} className="mt-8 space-y-4">
    <label className="block text-sm">E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3" /></label>
    <button disabled={state === "sending"} className="rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-violet)] px-5 py-3 font-medium text-white">{state === "sending" ? "Enviando…" : "Receber link seguro"}</button>
    {state === "sent" && <p role="status" className="text-sm text-[var(--success)]">Confira seu e-mail. O link expira em cinco minutos.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[var(--danger)]">Não foi possível enviar agora. Tente novamente em instantes.</p>}
  </form>;
}
```

`/entrar` wraps this form in a focused dark card. An authenticated user without membership is sent to `/criar-organizacao` only when no invitation id is present; that page calls `authClient.organization.create({ name, slug })`, which assigns the configured `admin` creator role, then sets the returned organization active. `/aceitar-convite` reads the `id` query parameter, asks the unauthenticated visitor to sign in with the invited email, then calls `acceptInvitation({ invitationId: id })` only after a session exists. Success redirects to `/visao-geral`; expired, cancelled, already-used, and email-mismatch errors get distinct PT-BR messages.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/components/auth/MagicLinkForm.test.tsx`  
Expected: 1 test passes.

Run: `npm run build`  
Expected: auth routes render and protected routes remain dynamic.

```bash
git add src/components/auth src/app/(auth)
git commit -m "feat: add secure invitation entry flow"
```

---

### Task 7: Admin team management

**Files:**
- Create: `src/app/(app)/equipe/actions.ts`
- Create: `src/app/(app)/equipe/page.tsx`
- Create: `src/components/team/InviteMemberForm.tsx`
- Create: `src/components/team/MemberList.tsx`
- Create: `src/app/(app)/equipe/actions.test.ts`

**Interfaces:**
- Consumes: `requireWorkspace()`, `can()`, Better Auth organization API.
- Produces: `inviteMember(formData)`, `cancelInvitation(formData)`, admin team UI.

- [ ] **Step 1: Write failing permission tests around the action guard**

```ts
// src/app/(app)/equipe/actions.test.ts
import { describe, expect, it } from "vitest";
import { assertCanInvite } from "./actions";

describe("assertCanInvite", () => {
  it("rejects members", () => expect(() => assertCanInvite("member")).toThrow("FORBIDDEN"));
  it("allows admins", () => expect(assertCanInvite("admin")).toBeUndefined());
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- "src/app/(app)/equipe/actions.test.ts"`  
Expected: FAIL because `./actions` does not exist.

- [ ] **Step 3: Implement tenant-safe server actions**

```ts
// src/app/(app)/equipe/actions.ts
"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { can, type WorkspaceRole } from "@/lib/auth/authorization";
import { requireWorkspace } from "@/lib/auth/session";

const InviteSchema = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()) });

export function assertCanInvite(role: WorkspaceRole) {
  if (!can("member:invite", role)) throw new Error("FORBIDDEN");
}

export async function inviteMember(formData: FormData) {
  const workspace = await requireWorkspace();
  assertCanInvite(workspace.role);
  const { email } = InviteSchema.parse({ email: formData.get("email") });
  await auth.api.createInvitation({
    headers: await headers(),
    body: { email, role: "member", organizationId: workspace.organizationId, resend: true },
  });
  revalidatePath("/equipe");
}
```

Implement cancellation with the same `workspace.organizationId`; never accept an organization id from form data. The page loads members and invitations through Better Auth using the active session headers, and returns `notFound()` for members so route existence does not disclose admin functionality.

- [ ] **Step 4: Implement the UI**

`InviteMemberForm` contains one e-mail field, explicit submit feedback, and a privacy note. `MemberList` has separate “Ativos” and “Convites pendentes” sections, status badges, resend, and cancel actions. The empty state says “Convide as pessoas que podem abrir suas redes para as vagas da organização.”

- [ ] **Step 5: Verify and commit**

Run: `npm test -- "src/app/(app)/equipe/actions.test.ts"`  
Expected: 2 tests pass.

Run: `npm run build`  
Expected: `/equipe` is protected and server actions compile.

```bash
git add "src/app/(app)/equipe" src/components/team
git commit -m "feat: let admins invite and manage members"
```

---

### Task 8: Integration, E2E, accessibility, and final review

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/auth-tenant.test.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-invitation.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed foundation.
- Produces: regression coverage and operational instructions.

- [ ] **Step 1: Add tenant integration tests**

The test creates organizations A and B, one admin in each, and an invitation in A. It asserts:

```ts
expect(await listInvitationsAs(adminA, organizationA.id)).toHaveLength(1);
await expect(listInvitationsAs(adminB, organizationA.id)).rejects.toThrow("FORBIDDEN");
await expect(acceptInvitationAs("wrong@example.com", invitationA.id)).rejects.toThrow("EMAIL_MISMATCH");
```

Run against a disposable PostgreSQL database:

```bash
npm run db:migrate
npx vitest run --config vitest.integration.config.ts
```

Expected: tenant isolation and invitation ownership tests pass.

- [ ] **Step 2: Add the critical E2E journey**

```ts
// tests/e2e/auth-invitation.spec.ts
import { expect, test } from "@playwright/test";

test("admin invites a member and the member lands in a private workspace", async ({ page }) => {
  await page.goto("/test-auth/login?as=admin-a");
  await page.goto("/equipe");
  await page.getByLabel("E-mail").fill("member@example.com");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("member@example.com")).toBeVisible();
  const invitationUrl = await page.getByTestId("test-invitation-url").getAttribute("href");
  await page.context().clearCookies();
  await page.goto(invitationUrl!);
  await page.goto("/test-auth/login?as=member-invited");
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page).toHaveURL(/\/visao-geral/);
  await expect(page.getByText("Oportunidades")).toBeVisible();
  await expect(page.getByText("Equipe")).toHaveCount(0);
});
```

The `/test-auth/*` helpers exist only when `NODE_ENV=test` and are unreachable in production builds.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npx vitest run --config vitest.integration.config.ts
npm run test:e2e
npm run lint -- --max-warnings=0
npm run db:check
npm run build
git status --short
```

Expected:

- all existing 47 tests still pass;
- new unit, integration, and E2E tests pass;
- zero lint warnings;
- migration schema is valid;
- production build succeeds;
- only intended changes are present.

- [ ] **Step 4: Perform the visual and accessibility review**

Verify at 1440×900, 1024×768, and 390×844:

- no horizontal overflow;
- navigation collapses to a labelled mobile drawer;
- all controls are reachable by keyboard with visible focus;
- status is never communicated by color alone;
- text contrast meets WCAG AA;
- reduced-motion preference disables decorative animation;
- PT-BR has no untranslated keys and EN switch renders the parallel copy;
- loading, empty, sent, expired invitation, error, and forbidden states are visually complete.

- [ ] **Step 5: Update README and commit**

Document PostgreSQL startup, environment variables, migrations, Resend domain requirement, passwordless flow, roles, and the fact that this phase does not yet ingest LinkedIn/Google sources.

```bash
git add README.md vitest.integration.config.ts playwright.config.ts tests
git commit -m "test: verify secure multi-user foundation"
```

---

## Completion Gate

This plan is complete only when an administrator can create/use an organization, send a real e-mail invitation, and a matching invited user can authenticate without a password, accept the invitation, and enter a role-correct workspace. A member must be unable to access `/equipe` or invoke invitation actions, and cross-organization access tests must pass.

The next plan starts only after this gate and covers worker/queue infrastructure plus Google Calendar, Google Contacts, and the experimental LinkedIn import flow.
