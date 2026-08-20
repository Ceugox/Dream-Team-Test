export type RemoteBrowserPage = object;

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
