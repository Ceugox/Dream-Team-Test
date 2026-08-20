import { chromium, type Page } from "playwright-core";
import { decryptProviderSessionReference, encryptProviderSessionReference } from "../crypto";
import type { LinkedInBrowserProvider, RemoteBrowserHandle } from "./types";

interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface BrowserContextLike {
  pages(): unknown[];
  newCDPSession(page: unknown): Promise<CdpSessionLike>;
}

interface BrowserConnectionLike {
  contexts(): BrowserContextLike[];
  close(): Promise<void>;
}

interface BrowserlessProviderConfig {
  endpoint: string;
  token: string;
  loginTimeoutMs: number;
}

interface BrowserlessProviderDependencies {
  appSecret?: string;
  connectOverCDP?: (endpoint: string) => Promise<BrowserConnectionLike>;
}

interface BrowserlessReference {
  browserWSEndpoint: string;
  liveURLId: string;
}

const CREATION_ERROR = "BROWSERLESS_SESSION_CREATION_FAILED";
const CONNECTION_ERROR = "BROWSERLESS_SESSION_CONNECTION_FAILED";

function safeError(code: string): Error {
  return new Error(code);
}

function providerEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol !== "wss:" && url.protocol !== "ws:") throw safeError(CONNECTION_ERROR);
  return url;
}

function browserlessOrigin(endpoint: string): { host: string; secure: boolean } {
  const url = new URL(endpoint);
  if (!["https:", "http:", "wss:", "ws:"].includes(url.protocol)) throw safeError(CONNECTION_ERROR);
  return { host: url.host, secure: url.protocol === "https:" || url.protocol === "wss:" };
}

function authenticatedEndpoint(endpoint: string, token: string): string {
  const url = providerEndpoint(endpoint);
  url.searchParams.set("token", token);
  return url.toString();
}

function assertInteractiveUrl(value: unknown, configuredEndpoint: string): string {
  if (typeof value !== "string") throw safeError(CREATION_ERROR);
  const liveUrl = new URL(value);
  const expected = browserlessOrigin(configuredEndpoint);
  if (liveUrl.protocol !== "https:" || liveUrl.host !== expected.host || liveUrl.searchParams.has("token")) {
    throw safeError(CREATION_ERROR);
  }
  return liveUrl.toString();
}

function assertReconnectEndpoint(value: unknown, configuredEndpoint: string): string {
  if (typeof value !== "string") throw safeError(CONNECTION_ERROR);
  const reconnectUrl = new URL(value);
  const expected = browserlessOrigin(configuredEndpoint);
  const expectedProtocol = expected.secure ? "wss:" : "ws:";
  if (reconnectUrl.protocol !== expectedProtocol || reconnectUrl.host !== expected.host) {
    throw safeError(CONNECTION_ERROR);
  }
  reconnectUrl.searchParams.delete("token");
  return reconnectUrl.toString();
}

function requiredString(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || value.length === 0) throw safeError(errorCode);
  return value;
}

function referencePayload(encrypted: string, appSecret: string | undefined, endpoint: string): BrowserlessReference {
  try {
    const parsed = JSON.parse(decryptProviderSessionReference(encrypted, appSecret)) as Record<string, unknown>;
    return {
      browserWSEndpoint: assertReconnectEndpoint(parsed.browserWSEndpoint, endpoint),
      liveURLId: requiredString(parsed.liveURLId, CONNECTION_ERROR),
    };
  } catch {
    throw safeError(CONNECTION_ERROR);
  }
}

async function activePage(browser: BrowserConnectionLike): Promise<{
  page: Page;
  cdp: CdpSessionLike;
}> {
  const context = browser.contexts()[0];
  const page = context?.pages()[0];
  if (!context || !page) throw safeError(CONNECTION_ERROR);
  const cdp = await context.newCDPSession(page);
  return { page: page as Page, cdp };
}

function remoteHandle(
  browser: BrowserConnectionLike,
  page: Page,
  cdp: CdpSessionLike,
  liveURLId: string,
): RemoteBrowserHandle {
  let interactiveUrlClosed = false;
  let disconnected = false;

  return {
    page,
    async closeInteractiveUrl() {
      if (interactiveUrlClosed) return;
      interactiveUrlClosed = true;
      try {
        const result = await cdp.send("Browserless.closeLiveURL", { liveURLId });
        if (result.error) throw safeError(CONNECTION_ERROR);
      } catch {
        throw safeError(CONNECTION_ERROR);
      }
    },
    async disconnect() {
      if (disconnected) return;
      disconnected = true;
      try {
        await browser.close();
      } catch {
        throw safeError(CONNECTION_ERROR);
      }
    },
  };
}

export function createBrowserlessProvider(
  config: BrowserlessProviderConfig,
  dependencies: BrowserlessProviderDependencies = {},
): LinkedInBrowserProvider {
  const connectOverCDP = dependencies.connectOverCDP ?? ((endpoint: string) => chromium.connectOverCDP(endpoint));

  const connect = async (encryptedReferencePayload: string): Promise<RemoteBrowserHandle> => {
    let browser: BrowserConnectionLike | undefined;
    try {
      const reference = referencePayload(encryptedReferencePayload, dependencies.appSecret, config.endpoint);
      browser = await connectOverCDP(authenticatedEndpoint(reference.browserWSEndpoint, config.token));
      const { page, cdp } = await activePage(browser);
      return remoteHandle(browser, page, cdp, reference.liveURLId);
    } catch {
      if (browser) await browser.close().catch(() => undefined);
      throw safeError(CONNECTION_ERROR);
    }
  };

  return {
    async createSession(input) {
      let browser: BrowserConnectionLike | undefined;
      try {
        browser = await connectOverCDP(authenticatedEndpoint(config.endpoint, config.token));
        const { cdp } = await activePage(browser);
        const liveResult = await cdp.send("Browserless.liveURL", {
          timeout: config.loginTimeoutMs,
          resizable: true,
          interactable: true,
        });
        if (liveResult.error) throw safeError(CREATION_ERROR);
        const interactiveUrl = assertInteractiveUrl(liveResult.liveURL, config.endpoint);
        const liveURLId = requiredString(liveResult.liveURLId, CREATION_ERROR);

        const reconnectResult = await cdp.send("Browserless.reconnect", { timeout: input.timeoutMs });
        if (reconnectResult.error) throw safeError(CREATION_ERROR);
        const browserWSEndpoint = assertReconnectEndpoint(reconnectResult.browserWSEndpoint, config.endpoint);
        const encryptedReferencePayload = encryptProviderSessionReference(
          JSON.stringify({ browserWSEndpoint, liveURLId }),
          dependencies.appSecret,
        );

        await browser.close();
        browser = undefined;
        return { encryptedReferencePayload, interactiveUrl };
      } catch {
        if (browser) await browser.close().catch(() => undefined);
        throw safeError(CREATION_ERROR);
      }
    },

    connect,

    async destroy(encryptedReferencePayload) {
      const handle = await connect(encryptedReferencePayload);
      try {
        await handle.closeInteractiveUrl();
      } finally {
        await handle.disconnect();
      }
    },
  };
}
