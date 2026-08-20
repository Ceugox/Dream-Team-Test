import puppeteer from "puppeteer-core";
import { decryptProviderSessionReference, encryptProviderSessionReference } from "../crypto";
import type { LinkedInBrowserProvider, RemoteBrowserHandle, RemoteBrowserPage } from "./types";

interface BrowserPageLike {
  createCDPSession(): Promise<unknown>;
}

interface BrowserConnectionLike {
  pages(): Promise<unknown[]>;
  disconnect(): Promise<void> | void;
  close(): Promise<void>;
}

interface AnchorProviderConfig {
  apiUrl: string;
  connectUrl: string;
  apiKey: string;
  sessionTimeoutMs: number;
}

type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface AnchorProviderDependencies {
  appSecret?: string;
  connect?: (options: { browserWSEndpoint: string }) => Promise<BrowserConnectionLike>;
  fetch?: FetchLike;
}

const CREATION_ERROR = "ANCHOR_SESSION_CREATION_FAILED";
const CONNECTION_ERROR = "ANCHOR_SESSION_CONNECTION_FAILED";

function safeError(code: string): Error {
  return new Error(code);
}

function requiredString(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || value.length === 0) throw safeError(errorCode);
  return value;
}

function assertInteractiveUrl(value: unknown, apiKey: string): string {
  const raw = requiredString(value, CREATION_ERROR);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw safeError(CREATION_ERROR);
  }
  if (url.protocol !== "https:" || raw.includes(apiKey)) throw safeError(CREATION_ERROR);
  return url.toString();
}

function sessionIdFromReference(encrypted: string, appSecret: string | undefined): string {
  try {
    const parsed = JSON.parse(decryptProviderSessionReference(encrypted, appSecret)) as Record<string, unknown>;
    return requiredString(parsed.anchorSessionId, CONNECTION_ERROR);
  } catch {
    throw safeError(CONNECTION_ERROR);
  }
}

async function activePage(browser: BrowserConnectionLike): Promise<RemoteBrowserPage> {
  const page = (await browser.pages())[0] as (BrowserPageLike & RemoteBrowserPage) | undefined;
  if (!page || typeof page.createCDPSession !== "function") throw safeError(CONNECTION_ERROR);
  return page;
}

function retryableOnce(operation: () => Promise<void>): () => Promise<void> {
  let complete = false;
  let inFlight: Promise<void> | undefined;
  return () => {
    if (complete) return Promise.resolve();
    if (inFlight) return inFlight;
    const current = operation()
      .then(() => { complete = true; })
      .finally(() => { if (inFlight === current) inFlight = undefined; });
    inFlight = current;
    return current;
  };
}

export function createAnchorProvider(
  config: AnchorProviderConfig,
  dependencies: AnchorProviderDependencies = {},
): LinkedInBrowserProvider {
  const connectBrowser = dependencies.connect ?? ((options) => puppeteer.connect(options));
  const httpFetch: FetchLike = dependencies.fetch ?? ((input, init) => fetch(input, init));

  const websocketEndpoint = (sessionId: string): string => {
    const url = new URL(config.connectUrl);
    if (url.protocol !== "wss:" && url.protocol !== "ws:") throw safeError(CONNECTION_ERROR);
    url.searchParams.set("apiKey", config.apiKey);
    url.searchParams.set("sessionId", sessionId);
    return url.toString();
  };

  const connectToSession = async (sessionId: string): Promise<{ browser: BrowserConnectionLike; page: RemoteBrowserPage }> => {
    const browser = await connectBrowser({ browserWSEndpoint: websocketEndpoint(sessionId) });
    try {
      return { browser, page: await activePage(browser) };
    } catch {
      await browser.close().catch(() => undefined);
      throw safeError(CONNECTION_ERROR);
    }
  };

  return {
    async createSession() {
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await httpFetch(`${config.apiUrl}/v1/sessions`, {
          method: "POST",
          headers: { "anchor-api-key": config.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            session: {
              timeout: {
                max_duration: Math.max(1, Math.ceil(config.sessionTimeoutMs / 60000)),
                // O login manual pode demorar sem nenhuma conexão CDP ativa;
                // a vida da sessão é controlada por max_duration + destroy explícito.
                idle_timeout: -1,
              },
              live_view: { read_only: false, one_time_url: true },
            },
            browser: { headless: { active: false } },
          }),
        });
      } catch {
        throw safeError(CREATION_ERROR);
      }
      if (!response.ok) throw safeError(CREATION_ERROR);
      const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
      const data = body?.data;
      if (!data) throw safeError(CREATION_ERROR);
      const sessionId = requiredString(data.id, CREATION_ERROR);
      const interactiveUrl = assertInteractiveUrl(data.live_view_url, config.apiKey);
      const encryptedReferencePayload = encryptProviderSessionReference(
        JSON.stringify({ anchorSessionId: sessionId }),
        dependencies.appSecret,
      );
      return { encryptedReferencePayload, interactiveUrl };
    },

    async connect(encryptedReferencePayload) {
      const sessionId = sessionIdFromReference(encryptedReferencePayload, dependencies.appSecret);
      let connection: { browser: BrowserConnectionLike; page: RemoteBrowserPage };
      try {
        connection = await connectToSession(sessionId);
      } catch {
        throw safeError(CONNECTION_ERROR);
      }
      const disconnect = retryableOnce(async () => {
        try {
          await connection.browser.disconnect();
        } catch {
          throw safeError(CONNECTION_ERROR);
        }
      });
      // A live view do Anchor é one_time_url e morre com a sessão; não há endpoint dedicado.
      const closeInteractiveUrl = retryableOnce(async () => undefined);
      return { page: connection.page, closeInteractiveUrl, disconnect } satisfies RemoteBrowserHandle;
    },

    async destroy(encryptedReferencePayload) {
      let sessionId: string;
      try {
        sessionId = sessionIdFromReference(encryptedReferencePayload, dependencies.appSecret);
      } catch {
        return;
      }
      await httpFetch(`${config.apiUrl}/v1/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "anchor-api-key": config.apiKey },
      }).catch(() => undefined);
    },
  };
}
