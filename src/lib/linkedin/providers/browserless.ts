import puppeteer from "puppeteer-core";
import { decryptProviderSessionReference, encryptProviderSessionReference } from "../crypto";
import type { LinkedInBrowserProvider, RemoteBrowserHandle, RemoteBrowserPage } from "./types";

interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface BrowserPageLike {
  createCDPSession(): Promise<CdpSessionLike>;
}

interface BrowserConnectionLike {
  pages(): Promise<unknown[]>;
  disconnect(): Promise<void> | void;
  close(): Promise<void>;
}

interface BrowserlessProviderConfig {
  endpoint: string;
  token: string;
  loginTimeoutMs: number;
  reconnectTimeoutMs: number;
}

interface BrowserlessProviderDependencies {
  appSecret?: string;
  connect?: (options: { browserWSEndpoint: string }) => Promise<BrowserConnectionLike>;
}

interface BrowserlessReference {
  browserWSEndpoint: string;
  liveURLId: string;
}

interface OpenBrowserConnection {
  browser: BrowserConnectionLike;
  cdp: CdpSessionLike;
  page: RemoteBrowserPage;
  reference: BrowserlessReference;
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
  page: RemoteBrowserPage;
  cdp: CdpSessionLike;
}> {
  const page = (await browser.pages())[0] as BrowserPageLike | undefined;
  if (!page || typeof page.createCDPSession !== "function") throw safeError(CONNECTION_ERROR);
  return { page, cdp: await page.createCDPSession() };
}

function retryableOnce(operation: () => Promise<void>): () => Promise<void> {
  let complete = false;
  let inFlight: Promise<void> | undefined;

  return () => {
    if (complete) return Promise.resolve();
    if (inFlight) return inFlight;

    const current = operation()
      .then(() => {
        complete = true;
      })
      .finally(() => {
        if (inFlight === current) inFlight = undefined;
      });
    inFlight = current;
    return current;
  };
}

function remoteHandle(
  browser: BrowserConnectionLike,
  page: RemoteBrowserPage,
  cdp: CdpSessionLike,
  liveURLId: string,
): RemoteBrowserHandle {
  const closeInteractiveUrl = retryableOnce(async () => {
    try {
      const result = await cdp.send("Browserless.closeLiveURL", { liveURLId });
      if (result.error) throw safeError(CONNECTION_ERROR);
    } catch {
      throw safeError(CONNECTION_ERROR);
    }
  });
  const disconnect = retryableOnce(async () => {
    try {
      await browser.disconnect();
    } catch {
      throw safeError(CONNECTION_ERROR);
    }
  });

  return { page, closeInteractiveUrl, disconnect };
}

async function bestEffortCloseLiveUrl(cdp: CdpSessionLike | undefined, liveURLId: string | undefined): Promise<void> {
  if (!cdp || !liveURLId) return;
  await cdp.send("Browserless.closeLiveURL", { liveURLId }).catch(() => undefined);
}

export function createBrowserlessProvider(
  config: BrowserlessProviderConfig,
  dependencies: BrowserlessProviderDependencies = {},
): LinkedInBrowserProvider {
  const connectBrowser = dependencies.connect ?? ((options) => puppeteer.connect(options));

  const openConnection = async (encryptedReferencePayload: string): Promise<OpenBrowserConnection> => {
    const reference = referencePayload(encryptedReferencePayload, dependencies.appSecret, config.endpoint);
    const browser = await connectBrowser({
      browserWSEndpoint: authenticatedEndpoint(reference.browserWSEndpoint, config.token),
    });
    try {
      const { page, cdp } = await activePage(browser);
      return { browser, cdp, page, reference };
    } catch {
      await browser.close().catch(() => undefined);
      throw safeError(CONNECTION_ERROR);
    }
  };

  const connect = async (encryptedReferencePayload: string): Promise<RemoteBrowserHandle> => {
    try {
      const connection = await openConnection(encryptedReferencePayload);
      return remoteHandle(
        connection.browser,
        connection.page,
        connection.cdp,
        connection.reference.liveURLId,
      );
    } catch {
      throw safeError(CONNECTION_ERROR);
    }
  };

  return {
    async createSession() {
      let browser: BrowserConnectionLike | undefined;
      let cdp: CdpSessionLike | undefined;
      let liveURLId: string | undefined;
      try {
        browser = await connectBrowser({
          browserWSEndpoint: authenticatedEndpoint(config.endpoint, config.token),
        });
        ({ cdp } = await activePage(browser));
        const liveResult = await cdp.send("Browserless.liveURL", {
          timeout: config.loginTimeoutMs,
          resizable: true,
          interactable: true,
        });
        if (liveResult.error) throw safeError(CREATION_ERROR);
        liveURLId = requiredString(liveResult.liveURLId, CREATION_ERROR);
        const interactiveUrl = assertInteractiveUrl(liveResult.liveURL, config.endpoint);

        const reconnectResult = await cdp.send("Browserless.reconnect", {
          timeout: config.reconnectTimeoutMs,
        });
        if (reconnectResult.error) throw safeError(CREATION_ERROR);
        const browserWSEndpoint = assertReconnectEndpoint(reconnectResult.browserWSEndpoint, config.endpoint);
        const encryptedReferencePayload = encryptProviderSessionReference(
          JSON.stringify({ browserWSEndpoint, liveURLId }),
          dependencies.appSecret,
        );

        await browser.disconnect();
        browser = undefined;
        return { encryptedReferencePayload, interactiveUrl };
      } catch {
        await bestEffortCloseLiveUrl(cdp, liveURLId);
        if (browser) await browser.close().catch(() => undefined);
        throw safeError(CREATION_ERROR);
      }
    },

    connect,

    async destroy(encryptedReferencePayload) {
      let connection: OpenBrowserConnection;
      try {
        connection = await openConnection(encryptedReferencePayload);
      } catch {
        return;
      }

      await bestEffortCloseLiveUrl(connection.cdp, connection.reference.liveURLId);
      await connection.browser.close().catch(() => undefined);
    },
  };
}
