/** Minimal page contract shared with collectors; keeps Puppeteer implementation details at the provider boundary. */
export interface RemoteBrowserPage {
  url(): string;
  goto(url: string, options?: { waitUntil?: "domcontentloaded" }): Promise<unknown>;
  evaluate<T>(pageFunction: (...args: never[]) => T | Promise<T>, ...args: unknown[]): Promise<T>;
}

export interface RemoteBrowserHandle {
  readonly page: RemoteBrowserPage;
  closeInteractiveUrl(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface LinkedInBrowserProvider {
  createSession(input: { sessionId: string; timeoutMs: number }): Promise<{
    encryptedReferencePayload: string;
    interactiveUrl: string;
  }>;
  connect(encryptedReferencePayload: string): Promise<RemoteBrowserHandle>;
  destroy(encryptedReferencePayload: string): Promise<void>;
}
