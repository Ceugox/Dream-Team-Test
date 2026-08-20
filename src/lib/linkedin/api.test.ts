import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createSession } from "../../app/api/linkedin/sessions/route";
import { GET as getSession } from "../../app/api/linkedin/sessions/[id]/route";
import { POST as cancelSession } from "../../app/api/linkedin/sessions/[id]/cancel/route";
import { GET as sessionEvents } from "../../app/api/linkedin/sessions/[id]/events/route";
import { POST as watchdog } from "../../app/api/internal/linkedin/watchdog/route";
import * as auth from "../platform/auth";
import * as runtime from "./runtime";
import * as orchestrator from "../orchestration/orchestrator";
import * as sessionRepository from "./sessionRepository";
import type { LinkedInSession } from "./types";

vi.mock("../platform/auth", () => ({ getAuthenticatedActor: vi.fn() }));
vi.mock("./runtime", () => ({ getLinkedInSyncService: vi.fn() }));
vi.mock("../orchestration/orchestrator", () => ({
  enqueueLinkedInSyncWorkflow: vi.fn(),
  cancelLinkedInWorkflowBySession: vi.fn(),
}));
vi.mock("./sessionRepository", () => ({
  findOwnedSession: vi.fn(),
  findAllExpiredSessions: vi.fn(),
  markFinished: vi.fn(),
}));

const actor = { role: "admin" as const, ownerId: "22222222-2222-4222-8222-222222222222", organizationId: "33333333-3333-4333-8333-333333333333" };
const owner = { type: "admin" as const, id: actor.ownerId, organizationId: actor.organizationId };
const sessionId = "44444444-4444-4444-8444-444444444444";

const publicSession = {
  id: sessionId, status: "awaiting_login" as const, inventoryCount: 0, enrichedCount: 0, failedCount: 0,
  createdAt: new Date(0), expiresAt: new Date(2700000), failureCode: null, failureMessageSafe: null,
};

const storedSession: LinkedInSession = { ...publicSession, providerSessionReference: "enc:v1:secret-reference", owner };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/linkedin/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function serviceWith(overrides: Record<string, unknown> = {}) {
  const service = {
    createInteractiveSession: vi.fn(async () => ({ session: publicSession, interactiveUrl: "https://live.browserless.example/session" })),
    cancelOwnedSession: vi.fn(async () => ({ ...publicSession, status: "cancelled" })),
    expireOrphanedSessions: vi.fn(async () => 1),
    ...overrides,
  };
  vi.mocked(runtime.getLinkedInSyncService).mockReturnValue(service as never);
  return service;
}

describe("LinkedIn session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.getAuthenticatedActor).mockResolvedValue(actor);
    delete process.env.CRON_SECRET;
  });

  it("returns 401 without an authenticated actor on every route", async () => {
    vi.mocked(auth.getAuthenticatedActor).mockResolvedValue(null);
    expect((await createSession(jsonRequest({ consent: true }))).status).toBe(401);
    expect((await getSession(new Request("http://localhost"), params(sessionId))).status).toBe(401);
    expect((await cancelSession(new Request("http://localhost"), params(sessionId))).status).toBe(401);
    expect((await sessionEvents(new Request("http://localhost"), params(sessionId))).status).toBe(401);
  });

  it("creates a session with consent, enqueues the workflow and returns only safe fields", async () => {
    const service = serviceWith();
    vi.mocked(orchestrator.enqueueLinkedInSyncWorkflow).mockResolvedValue("workflow-1");
    const response = await createSession(jsonRequest({ consent: true }));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const body = await response.json();
    expect(body.session.id).toBe(sessionId);
    expect(body.interactiveUrl).toBe("https://live.browserless.example/session");
    expect(JSON.stringify(body)).not.toContain("enc:v1");
    expect(service.createInteractiveSession).toHaveBeenCalledWith(owner, { consent: true });
    expect(orchestrator.enqueueLinkedInSyncWorkflow).toHaveBeenCalledWith(sessionId, owner);
  });

  it("requires consent and rejects malformed bodies", async () => {
    serviceWith();
    expect((await createSession(jsonRequest({ consent: false }))).status).toBe(400);
    expect((await createSession(jsonRequest("not-json-object"))).status).toBe(400);
  });

  it("maps service errors to 409 capacity and 503 disabled", async () => {
    serviceWith({ createInteractiveSession: vi.fn(async () => { throw new Error("LINKEDIN_SYNC_CAPACITY"); }) });
    expect((await createSession(jsonRequest({ consent: true }))).status).toBe(409);
    vi.mocked(runtime.getLinkedInSyncService).mockImplementation(() => { throw new Error("LINKEDIN_SYNC_DISABLED"); });
    expect((await createSession(jsonRequest({ consent: true }))).status).toBe(503);
  });

  it("cancels the created session when the workflow enqueue fails", async () => {
    const service = serviceWith();
    vi.mocked(orchestrator.enqueueLinkedInSyncWorkflow).mockRejectedValue(new Error("db down"));
    const response = await createSession(jsonRequest({ consent: true }));
    expect(response.status).toBe(500);
    expect(service.cancelOwnedSession).toHaveBeenCalledWith(owner, sessionId);
  });

  it("returns 404 for a session owned by someone else and the DTO without internal reference", async () => {
    vi.mocked(sessionRepository.findOwnedSession).mockResolvedValue(null);
    expect((await getSession(new Request("http://localhost"), params(sessionId))).status).toBe(404);

    vi.mocked(sessionRepository.findOwnedSession).mockResolvedValue(storedSession);
    const response = await getSession(new Request("http://localhost"), params(sessionId));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.id).toBe(sessionId);
    expect(JSON.stringify(body)).not.toContain("secret-reference");
    expect(sessionRepository.findOwnedSession).toHaveBeenCalledWith(owner, sessionId);
  });

  it("cancels idempotently and cancels the queue workflow", async () => {
    serviceWith();
    vi.mocked(orchestrator.cancelLinkedInWorkflowBySession).mockResolvedValue(1);
    const first = await cancelSession(new Request("http://localhost"), params(sessionId));
    const second = await cancelSession(new Request("http://localhost"), params(sessionId));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).session.status).toBe("cancelled");
    expect(orchestrator.cancelLinkedInWorkflowBySession).toHaveBeenCalledWith(sessionId, "cancelled_by_owner");
  });

  it("streams the public session state and closes on a terminal status", async () => {
    vi.mocked(sessionRepository.findOwnedSession).mockResolvedValue({ ...storedSession, status: "completed" });
    const response = await sessionEvents(new Request("http://localhost"), params(sessionId));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).toContain("event: session");
    expect(text).toContain('"status":"completed"');
    expect(text).not.toContain("secret-reference");
  });

  it("protects the watchdog with the cron secret and reports only counts", async () => {
    serviceWith();
    vi.mocked(sessionRepository.findAllExpiredSessions).mockResolvedValue([{ ...storedSession, status: "awaiting_login" }]);
    vi.mocked(orchestrator.cancelLinkedInWorkflowBySession).mockResolvedValue(1);

    expect((await watchdog(new Request("http://localhost", { method: "POST" }))).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-value";
    expect((await watchdog(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);

    const response = await watchdog(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer cron-secret-value" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ expired: 1 });
    expect(orchestrator.cancelLinkedInWorkflowBySession).toHaveBeenCalledWith(sessionId, "linkedin_session_expired");
  });

  it("expires orphaned sessions even when the integration is disabled", async () => {
    process.env.CRON_SECRET = "cron-secret-value";
    vi.mocked(runtime.getLinkedInSyncService).mockImplementation(() => { throw new Error("LINKEDIN_SYNC_DISABLED"); });
    vi.mocked(sessionRepository.findAllExpiredSessions).mockResolvedValue([{ ...storedSession, status: "awaiting_login" }]);
    vi.mocked(sessionRepository.markFinished).mockResolvedValue({ ...storedSession, status: "expired" });
    vi.mocked(orchestrator.cancelLinkedInWorkflowBySession).mockResolvedValue(0);
    const response = await watchdog(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer cron-secret-value" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).expired).toBe(1);
    expect(sessionRepository.markFinished).toHaveBeenCalledWith(owner, sessionId, "expired");
  });
});
