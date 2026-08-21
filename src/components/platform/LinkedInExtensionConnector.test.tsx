// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LinkedInExtensionConnector } from "./LinkedInExtensionConnector";

function extensionMessage(type: string, extra: Record<string, unknown> = {}) {
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: window.location.origin,
    data: { source: "referral-copilot-extension", type, ...extra },
  }));
}

describe("LinkedInExtensionConnector", () => {
  beforeEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  function renderConnector(onFinished?: () => void) {
    return render(<LinkedInExtensionConnector appearance="cta" connected={false} contactCount={0} endpoint="/api/member/linkedin" onFinished={onFinished} />);
  }

  it("apresenta a conexão pelo conector, sem prometer sessão remota", () => {
    renderConnector();
    expect(screen.getByRole("button", { name: "Conectar pelo conector →" })).toBeTruthy();
    expect(screen.getByText(/abre o LinkedIn em uma nova aba/)).toBeTruthy();
    expect(screen.getByText(/Nenhuma senha passa pela plataforma/)).toBeTruthy();
    expect(screen.queryByText(/sessão privada será aberta/)).toBeNull();
  });

  it("ao clicar, fala direto com a extensão (sem criar sessão remota)", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderConnector();
    fireEvent.click(screen.getByRole("button", { name: "Conectar pelo conector →" }));
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: "referral-copilot-app", type: "rc:start-linkedin-sync" }),
      window.location.origin,
    );
    expect(fetchSpy).not.toHaveBeenCalledWith("/api/linkedin/sessions", expect.anything());
  });

  it("oferece o download quando a extensão não responde", () => {
    vi.useFakeTimers();
    renderConnector();
    fireEvent.click(screen.getByRole("button", { name: "Conectar pelo conector →" }));
    act(() => { vi.advanceTimersByTime(2000); });
    const link = screen.getByRole("link", { name: /Baixar conector/ });
    expect(link.getAttribute("href")).toBe("/referral-copilot-linkedin-connector.zip");
  });

  it("acompanha o progresso e salva as conexões coletadas", async () => {
    const onFinished = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ count: 372 }) } as never);
    renderConnector(onFinished);
    fireEvent.click(screen.getByRole("button", { name: "Conectar pelo conector →" }));

    await act(async () => { extensionMessage("rc:linkedin-extension-ready"); });
    expect(screen.getByText(/LinkedIn aberto em uma nova aba/)).toBeTruthy();

    await act(async () => { extensionMessage("rc:linkedin-sync-progress", { count: 120 }); });
    expect(screen.getByText("120 conexões encontradas…")).toBeTruthy();

    await act(async () => { extensionMessage("rc:linkedin-sync-complete", { contacts: [{ name: "Ana", profileUrl: "https://www.linkedin.com/in/ana" }] }); });
    expect(fetchSpy).toHaveBeenCalledWith("/api/member/linkedin", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(/372 conexões sincronizadas/)).toBeTruthy();
    expect(onFinished).toHaveBeenCalled();
  });

  it("mantém alvo de toque mínimo e largura fluida no mobile", () => {
    renderConnector();
    const cta = screen.getByRole("button", { name: "Conectar pelo conector →" });
    expect(cta.className).toMatch(/min-h-14/);
    expect(cta.className).toMatch(/w-full/);
  });
});
