import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchorProvider } from "./anchor";
import { decryptProviderSessionReference } from "../crypto";

const testSecret = "anchor-provider-test-secret";
const originalSecret = process.env.APP_SECRET;

const config = {
  apiUrl: "https://api.anchorbrowser.io",
  connectUrl: "wss://connect.anchorbrowser.io",
  apiKey: "anchor-key-123",
  sessionTimeoutMs: 2700000,
};

function fakeBrowser() {
  const page = { marker: "remote-page", createCDPSession: vi.fn(async () => ({})) };
  const browser = {
    pages: vi.fn(async () => [page]),
    disconnect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { browser, page };
}

function fetchResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

function fetchSpyFor(body: unknown) {
  return vi.fn(async (_url: string, _init?: FetchInit) => fetchResponse(body));
}

const createdBody = {
  data: {
    id: "anchor-session-1",
    cdp_url: "wss://connect.anchorbrowser.io?sessionId=anchor-session-1",
    live_view_url: "https://live.anchorbrowser.io/inspector.html?host=abc",
  },
};

describe("Anchor browser provider", () => {
  beforeEach(() => { process.env.APP_SECRET = testSecret; });
  afterEach(() => { process.env.APP_SECRET = originalSecret; });

  it("creates a one-time interactive session with the session lifetime budget", async () => {
    const fetchSpy = fetchSpyFor(createdBody);
    const provider = createAnchorProvider(config, { appSecret: testSecret, fetch: fetchSpy });

    const created = await provider.createSession({ sessionId: "ignored", timeoutMs: 600000 });

    expect(created.interactiveUrl).toBe("https://live.anchorbrowser.io/inspector.html?host=abc");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anchorbrowser.io/v1/sessions");
    expect(init?.headers?.["anchor-api-key"]).toBe("anchor-key-123");
    const body = JSON.parse(init?.body ?? "{}");
    expect(body.session.timeout).toEqual({ max_duration: 45, idle_timeout: -1 });
    expect(body.session.live_view).toEqual({ read_only: false, one_time_url: true });
    const reference = JSON.parse(decryptProviderSessionReference(created.encryptedReferencePayload, testSecret));
    expect(reference).toEqual({ anchorSessionId: "anchor-session-1" });
    expect(created.encryptedReferencePayload).not.toContain("anchor-key-123");
  });

  it("rejects a live view URL that is not https or leaks the api key", async () => {
    const insecure = { data: { ...createdBody.data, live_view_url: "http://live.anchorbrowser.io/x" } };
    const leaking = { data: { ...createdBody.data, live_view_url: "https://live.anchorbrowser.io/x?key=anchor-key-123" } };
    for (const body of [insecure, leaking]) {
      const provider = createAnchorProvider(config, { appSecret: testSecret, fetch: vi.fn(async () => fetchResponse(body)) });
      await expect(provider.createSession({ sessionId: "s", timeoutMs: 1 })).rejects.toThrow("ANCHOR_SESSION_CREATION_FAILED");
    }
  });

  it("maps API failures to a safe creation error without the raw response", async () => {
    const provider = createAnchorProvider(config, {
      appSecret: testSecret,
      fetch: vi.fn(async () => fetchResponse({ error: { message: "secret-detail token=abc" } }, false, 402)),
    });
    await expect(provider.createSession({ sessionId: "s", timeoutMs: 1 }))
      .rejects.toThrow("ANCHOR_SESSION_CREATION_FAILED");
  });

  it("reconnects to the same session by id with the key only server-side", async () => {
    const { browser, page } = fakeBrowser();
    const connect = vi.fn(async () => browser);
    const provider = createAnchorProvider(config, { appSecret: testSecret, fetch: vi.fn(async () => fetchResponse(createdBody)), connect });
    const created = await provider.createSession({ sessionId: "s", timeoutMs: 1 });

    const handle = await provider.connect(created.encryptedReferencePayload);
    expect(connect).toHaveBeenCalledWith({
      browserWSEndpoint: "wss://connect.anchorbrowser.io/?apiKey=anchor-key-123&sessionId=anchor-session-1",
    });
    expect(handle.page).toBe(page);
    await handle.closeInteractiveUrl();
    await handle.disconnect();
    await handle.disconnect();
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered references and destroys sessions via the API", async () => {
    const fetchSpy = fetchSpyFor(createdBody);
    const provider = createAnchorProvider(config, { appSecret: testSecret, fetch: fetchSpy });
    await expect(provider.connect("enc:v1:tampered")).rejects.toThrow("ANCHOR_SESSION_CONNECTION_FAILED");

    const created = await provider.createSession({ sessionId: "s", timeoutMs: 1 });
    await provider.destroy(created.encryptedReferencePayload);
    const destroyCall = fetchSpy.mock.calls.at(-1);
    expect(destroyCall?.[0]).toBe("https://api.anchorbrowser.io/v1/sessions/anchor-session-1");
    expect(destroyCall?.[1]?.method).toBe("DELETE");
  });

  it("never throws from destroy even when the API is down", async () => {
    const provider = createAnchorProvider(config, {
      appSecret: testSecret,
      fetch: vi.fn(async () => { throw new Error("network down token=leak"); }),
    });
    await expect(provider.destroy("enc:v1:invalid")).resolves.toBeUndefined();
  });
});
