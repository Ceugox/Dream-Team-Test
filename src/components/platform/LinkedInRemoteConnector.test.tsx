// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LinkedInRemoteConnector, type PublicLinkedInSessionDto } from "./LinkedInRemoteConnector";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  close() { this.closed = true; }
  emit(type: string, payload: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }
}

function sessionDto(overrides: Partial<PublicLinkedInSessionDto> = {}): PublicLinkedInSessionDto {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    status: "awaiting_login",
    inventoryCount: 0,
    enrichedCount: 0,
    failedCount: 0,
    expiresAt: new Date(2700000).toISOString(),
    failureCode: null,
    failureMessageSafe: null,
    ...overrides,
  };
}

const createdResponse = {
  ok: true,
  status: 201,
  json: async () => ({ session: sessionDto(), interactiveUrl: "https://live.browserless.example/session" }),
};

describe("LinkedInRemoteConnector", () => {
  beforeEach(() => {
    cleanup();
    FakeEventSource.instances = [];
    vi.restoreAllMocks();
    vi.stubGlobal("EventSource", FakeEventSource as never);
    sessionStorage.clear();
  });

  function renderConnector(onFinished?: () => void) {
    return render(<LinkedInRemoteConnector appearance="cta" connected={false} contactCount={0} fallbackEndpoint="/api/member/linkedin" onFinished={onFinished} />);
  }

  it("shows the approved copy with the trust microcopy", () => {
    renderConnector();
    expect(screen.getByText("Conecte sua rede")).toBeTruthy();
    expect(screen.getByText(/Uma sessão privada será aberta/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar com LinkedIn →" })).toBeTruthy();
    expect(screen.getByText(/Login normal em tela isolada · Rede mapeada automaticamente · Sessão apagada ao concluir/)).toBeTruthy();
  });

  it("opens the preparing tab synchronously on the click gesture and registers consent", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(tab as never);
    let resolveFetch: (value: Response) => void = () => undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));

    renderConnector();
    fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" }));
    expect(openSpy).toHaveBeenCalledWith("/linkedin/session/preparing", "_blank");

    await act(async () => { resolveFetch(createdResponse as never); });
    expect(fetchSpy).toHaveBeenCalledWith("/api/linkedin/sessions", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ consent: true }),
    }));
    expect(tab.location.href).toBe("https://live.browserless.example/session");
  });

  it("offers the login link when the popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createdResponse as never);

    renderConnector();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    const fallback = screen.getByRole("link", { name: /Abrir tela de login/ });
    expect(fallback.getAttribute("href")).toBe("https://live.browserless.example/session");
  });

  it("tracks SSE progress with the N of M counter and early results", async () => {
    vi.spyOn(window, "open").mockReturnValue({ location: { href: "" }, close: vi.fn() } as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createdResponse as never);
    renderConnector();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    const source = FakeEventSource.instances[0];
    expect(source.url).toContain("/api/linkedin/sessions/44444444-4444-4444-8444-444444444444/events");

    await act(async () => { source.emit("session", sessionDto({ status: "inventorying" })); });
    expect(screen.getByText("Mapeando sua rede…")).toBeTruthy();

    await act(async () => { source.emit("session", sessionDto({ status: "enriching", inventoryCount: 12, enrichedCount: 3 })); });
    expect(screen.getByText("3 de 12 perfis analisados")).toBeTruthy();

    await act(async () => { source.emit("session", sessionDto({ status: "results_available", inventoryCount: 12, enrichedCount: 4 })); });
    expect(screen.getByText(/primeiras recomendações/)).toBeTruthy();
  });

  it("finishes and closes the stream on a terminal status", async () => {
    const onFinished = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { href: "" }, close: vi.fn() } as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createdResponse as never);
    renderConnector(onFinished);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    const source = FakeEventSource.instances[0];
    await act(async () => { source.emit("session", sessionDto({ status: "completed", inventoryCount: 12, enrichedCount: 12 })); });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
    expect(screen.getByRole("button", { name: "Continuar com LinkedIn →" })).toBeTruthy();
  });

  it("cancels through Encerrar agora", async () => {
    const onFinished = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { href: "" }, close: vi.fn() } as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createdResponse as never);
    renderConnector(onFinished);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ session: sessionDto({ status: "cancelled" }) }) } as never);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Encerrar agora" })); });
    expect(fetchSpy).toHaveBeenCalledWith("/api/linkedin/sessions/44444444-4444-4444-8444-444444444444/cancel", { method: "POST" });
    expect(onFinished).toHaveBeenCalled();
  });

  it("recovers from a failed start with a retry action", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "capacity_exhausted" }) } as never);
    renderConnector();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    expect(tab.close).toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Outra sessão está em andamento");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usar o conector local (extensão) →" })).toBeTruthy();
  });

  it("offers the local extension flow as fallback after a failure", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "sync_disabled" }) } as never);
    const postMessageSpy = vi.spyOn(window, "postMessage");
    renderConnector();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar com LinkedIn →" })); });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Usar o conector local (extensão) →" })); });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: "referral-copilot-app", type: "rc:start-linkedin-sync" }),
      window.location.origin,
    );
  });

  it("keeps touch targets at 44px minimum and fluid widths for small screens", () => {
    renderConnector();
    const cta = screen.getByRole("button", { name: "Continuar com LinkedIn →" });
    expect(cta.className).toMatch(/min-h-14/);
    expect(cta.className).toMatch(/w-full/);
  });
});
