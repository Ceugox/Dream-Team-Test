import { describe, expect, it, vi } from "vitest";
import { decryptProviderSessionReference, encryptProviderSessionReference } from "../crypto";
import { createBrowserlessProvider } from "./browserless";

const token = "browserless-token-that-must-stay-server-side";
const appSecret = "test-only-provider-reference-secret";
const endpoint = "https://production-sfo.browserless.io";
const reconnectEndpoint = "wss://production-sfo.browserless.io/reconnect/session-123";
const interactiveUrl = "https://production-sfo.browserless.io/live/session-123";

interface CdpCall {
  method: string;
  params: Record<string, unknown> | undefined;
}

function remoteBrowserFake(responses?: {
  liveURL?: Record<string, unknown>;
  reconnect?: Record<string, unknown>;
  closeLiveURL?: Record<string, unknown>;
}) {
  const calls: CdpCall[] = [];
  const page = { marker: "remote-page" };
  const cdp = {
    async send(method: string, params?: Record<string, unknown>) {
      calls.push({ method, params });
      if (method === "Browserless.liveURL") {
        return responses?.liveURL ?? { error: null, liveURLId: "live-123", liveURL: interactiveUrl };
      }
      if (method === "Browserless.reconnect") {
        return responses?.reconnect ?? { auth: null, error: null, browserWSEndpoint: reconnectEndpoint };
      }
      if (method === "Browserless.closeLiveURL") {
        return responses?.closeLiveURL ?? { error: null, liveURLId: "live-123" };
      }
      throw new Error(`Unexpected CDP method: ${method}`);
    },
  };
  const context = {
    pages: () => [page],
    newCDPSession: vi.fn(async () => cdp),
  };
  const browser = {
    contexts: () => [context],
    close: vi.fn(async () => undefined),
  };

  return { browser, calls, cdp, context, page };
}

function providerWith(
  connectOverCDP: (url: string) => Promise<ReturnType<typeof remoteBrowserFake>["browser"]>,
) {
  return createBrowserlessProvider(
    { endpoint, token, loginTimeoutMs: 600_000 },
    { appSecret, connectOverCDP },
  );
}

describe("Browserless LinkedIn browser provider", () => {
  it("creates a token-free HTTPS LiveURL and an encrypted reconnect reference", async () => {
    const remote = remoteBrowserFake();
    const connectedUrls: string[] = [];
    const provider = providerWith(async (url) => {
      connectedUrls.push(url);
      return remote.browser;
    });

    const result = await provider.createSession({ sessionId: "linkedin-session-123", timeoutMs: 240_000 });

    const initialEndpoint = new URL(connectedUrls[0]);
    expect(initialEndpoint.protocol).toBe("wss:");
    expect(initialEndpoint.hostname).toBe("production-sfo.browserless.io");
    expect(initialEndpoint.searchParams.get("token")).toBe(token);
    expect(remote.calls).toContainEqual({
      method: "Browserless.liveURL",
      params: { timeout: 600_000, resizable: true, interactable: true },
    });
    expect(remote.calls).toContainEqual({
      method: "Browserless.reconnect",
      params: { timeout: 240_000 },
    });
    expect(result.interactiveUrl).toBe(interactiveUrl);
    expect(result.interactiveUrl).not.toContain(token);
    expect(result.encryptedReferencePayload).toMatch(/^enc:v1:/);
    expect(result.encryptedReferencePayload).not.toContain(reconnectEndpoint);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.parse(decryptProviderSessionReference(result.encryptedReferencePayload, appSecret))).toEqual({
      browserWSEndpoint: reconnectEndpoint,
      liveURLId: "live-123",
    });
    expect(remote.browser.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://production-sfo.browserless.io/live/session-123",
    "https://attacker.example/live/session-123",
    "https://production-sfo.browserless.io.evil.example/live/session-123",
    `https://production-sfo.browserless.io/live/session-123?token=${token}`,
  ])("rejects a LiveURL outside the configured secure provider origin: %s", async (unsafeLiveUrl) => {
    const remote = remoteBrowserFake({
      liveURL: { error: null, liveURLId: "live-123", liveURL: unsafeLiveUrl },
    });
    const provider = providerWith(async () => remote.browser);

    await expect(provider.createSession({ sessionId: "session", timeoutMs: 240_000 }))
      .rejects.toThrow("BROWSERLESS_SESSION_CREATION_FAILED");
    expect(remote.browser.close).toHaveBeenCalledTimes(1);
  });

  it("redacts provider errors without leaking a token or WebSocket URL", async () => {
    const secretWebSocket = `wss://production-sfo.browserless.io/reconnect/private?token=${token}`;
    const provider = providerWith(async () => {
      throw new Error(`Browserless rejected ${secretWebSocket}`);
    });

    try {
      await provider.createSession({ sessionId: "session", timeoutMs: 240_000 });
      throw new Error("expected provider creation to fail");
    } catch (error) {
      expect(error).toHaveProperty("message", "BROWSERLESS_SESSION_CREATION_FAILED");
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(secretWebSocket);
    }
  });

  it("does not persist a token returned on a reconnect endpoint", async () => {
    const remote = remoteBrowserFake({
      reconnect: {
        auth: null,
        error: null,
        browserWSEndpoint: `${reconnectEndpoint}?token=${token}&session=session-123`,
      },
    });
    const provider = providerWith(async () => remote.browser);

    const result = await provider.createSession({ sessionId: "session", timeoutMs: 240_000 });
    const decrypted = decryptProviderSessionReference(result.encryptedReferencePayload, appSecret);

    expect(decrypted).not.toContain(token);
    expect(JSON.parse(decrypted)).toEqual({
      browserWSEndpoint: `${reconnectEndpoint}?session=session-123`,
      liveURLId: "live-123",
    });
  });

  it("rejects error-shaped CDP responses without exposing provider details", async () => {
    const remote = remoteBrowserFake({
      liveURL: { error: `invalid token ${token}`, liveURLId: null, liveURL: null },
    });
    const provider = providerWith(async () => remote.browser);

    await expect(provider.createSession({ sessionId: "session", timeoutMs: 240_000 }))
      .rejects.toThrow("BROWSERLESS_SESSION_CREATION_FAILED");
  });

  it("reconnects with server credentials and exposes only the page and lifecycle methods", async () => {
    const remote = remoteBrowserFake();
    const connectedUrls: string[] = [];
    const provider = providerWith(async (url) => {
      connectedUrls.push(url);
      return remote.browser;
    });
    const reference = encryptProviderSessionReference(JSON.stringify({
      browserWSEndpoint: reconnectEndpoint,
      liveURLId: "live-123",
    }), appSecret);

    const handle = await provider.connect(reference);

    const connectedEndpoint = new URL(connectedUrls[0]);
    expect(connectedEndpoint.searchParams.get("token")).toBe(token);
    expect(handle.page).toBe(remote.page);
    expect(Object.keys(handle).sort()).toEqual(["closeInteractiveUrl", "disconnect", "page"]);

    await handle.closeInteractiveUrl();
    await handle.closeInteractiveUrl();
    expect(remote.calls.filter(({ method }) => method === "Browserless.closeLiveURL")).toEqual([
      { method: "Browserless.closeLiveURL", params: { liveURLId: "live-123" } },
    ]);

    await handle.disconnect();
    await handle.disconnect();
    expect(remote.browser.close).toHaveBeenCalledTimes(1);
  });

  it("rejects an authenticated reconnect endpoint on a different provider host", async () => {
    const remote = remoteBrowserFake();
    const provider = providerWith(async () => remote.browser);
    const reference = encryptProviderSessionReference(JSON.stringify({
      browserWSEndpoint: "wss://attacker.example/reconnect/session-123",
      liveURLId: "live-123",
    }), appSecret);

    await expect(provider.connect(reference)).rejects.toThrow("BROWSERLESS_SESSION_CONNECTION_FAILED");
    expect(remote.browser.close).not.toHaveBeenCalled();
  });

  it("destroys a referenced session and closes its LiveURL", async () => {
    const remote = remoteBrowserFake();
    const provider = providerWith(async () => remote.browser);
    const reference = encryptProviderSessionReference(JSON.stringify({
      browserWSEndpoint: reconnectEndpoint,
      liveURLId: "live-123",
    }), appSecret);

    await provider.destroy(reference);

    expect(remote.calls).toContainEqual({
      method: "Browserless.closeLiveURL",
      params: { liveURLId: "live-123" },
    });
    expect(remote.browser.close).toHaveBeenCalledTimes(1);
  });

  it("keeps provider methods safe to inject as standalone callbacks", async () => {
    const remote = remoteBrowserFake();
    const provider = providerWith(async () => remote.browser);
    const reference = encryptProviderSessionReference(JSON.stringify({
      browserWSEndpoint: reconnectEndpoint,
      liveURLId: "live-123",
    }), appSecret);
    const destroy = provider.destroy;

    await destroy(reference);

    expect(remote.browser.close).toHaveBeenCalledTimes(1);
  });
});
