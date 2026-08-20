"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PublicLinkedInSessionDto = {
  id: string;
  status: string;
  inventoryCount: number;
  enrichedCount: number;
  failedCount: number;
  expiresAt: string;
  failureCode: string | null;
  failureMessageSafe: string | null;
};

const TERMINAL_STATUSES = ["completed", "cancelled", "failed", "expired"];

export const STATUS_LABELS: Record<string, string> = {
  preparing: "Preparando sua sessão privada…",
  awaiting_login: "Aguardando seu login no LinkedIn…",
  authenticated: "Login confirmado. Iniciando o mapeamento…",
  inventorying: "Mapeando sua rede…",
  enriching: "Analisando os perfis mais relevantes…",
  results_available: "Primeiros resultados disponíveis ✓",
  completed: "Rede conectada ✓",
  needs_attention: "O LinkedIn pediu uma verificação extra. Abra o LinkedIn, conclua a verificação e tente de novo mais tarde.",
  paused_rate_limit: "Pausamos para respeitar os limites do LinkedIn. Tente novamente em alguns minutos.",
  cancelled: "Sessão encerrada. Nada ficou armazenado.",
  failed: "Não foi possível concluir agora. Você pode tentar de novo.",
  expired: "A sessão expirou por segurança. Você pode abrir uma nova.",
};

export function liveUrlStorageKey(sessionId: string): string {
  return `linkedin-live-url:${sessionId}`;
}

export function useLinkedInSessionStream(
  sessionId: string | null,
  initial: PublicLinkedInSessionDto | null,
  onTerminal?: (session: PublicLinkedInSessionDto) => void,
) {
  const [session, setSession] = useState<PublicLinkedInSessionDto | null>(initial);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/linkedin/sessions/${sessionId}/events`);
    const receive = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as PublicLinkedInSessionDto;
        setSession(next);
        if (TERMINAL_STATUSES.includes(next.status)) {
          source.close();
          sessionStorage.removeItem(liveUrlStorageKey(sessionId));
          onTerminalRef.current?.(next);
        }
      } catch {
        // evento malformado é ignorado; o próximo poll corrige o estado
      }
    };
    source.addEventListener("session", receive);
    return () => {
      source.removeEventListener("session", receive);
      source.close();
    };
  }, [sessionId]);

  return { session, setSession };
}

export async function cancelLinkedInSession(sessionId: string): Promise<PublicLinkedInSessionDto | null> {
  const response = await fetch(`/api/linkedin/sessions/${sessionId}/cancel`, { method: "POST" });
  if (!response.ok) return null;
  const body = await response.json();
  return body.session ?? null;
}

type ConnectorProps = {
  connected: boolean;
  contactCount: number;
  appearance: "card" | "cta";
  onFinished?: () => void;
};

export function LinkedInRemoteConnector({ connected, contactCount, appearance, onFinished }: ConnectorProps) {
  const [phase, setPhase] = useState<"idle" | "creating" | "active">("idle");
  const [error, setError] = useState("");
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { session } = useLinkedInSessionStream(activeSessionId, null, () => {
    setPhase("idle");
    setActiveSessionId(null);
    setBlockedUrl(null);
    onFinished?.();
  });

  const connect = useCallback(async () => {
    setError("");
    setBlockedUrl(null);
    // window.open precisa acontecer no gesto do usuário, antes de qualquer await.
    const tab = typeof window.open === "function" ? window.open("/linkedin/session/preparing", "_blank") : null;
    setPhase("creating");
    let response: Response;
    try {
      response = await fetch("/api/linkedin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
    } catch {
      tab?.close();
      setPhase("idle");
      setError("Não foi possível iniciar agora. Verifique sua conexão e tente de novo.");
      return;
    }
    if (!response.ok) {
      tab?.close();
      setPhase("idle");
      const body = await response.json().catch(() => ({ error: "" }));
      setError(body.error === "capacity_exhausted"
        ? "Outra sessão está em andamento. Aguarde alguns minutos e tente de novo."
        : body.error === "sync_disabled"
          ? "A conexão com o LinkedIn está temporariamente indisponível."
          : "Não foi possível iniciar agora. Tente novamente em instantes.");
      return;
    }
    const data = await response.json() as { session: PublicLinkedInSessionDto; interactiveUrl: string };
    sessionStorage.setItem(liveUrlStorageKey(data.session.id), data.interactiveUrl);
    if (tab) {
      tab.location.href = data.interactiveUrl;
    } else {
      setBlockedUrl(data.interactiveUrl);
    }
    setActiveSessionId(data.session.id);
    setPhase("active");
  }, []);

  const stopNow = useCallback(async () => {
    if (!activeSessionId) return;
    await cancelLinkedInSession(activeSessionId);
    setPhase("idle");
    setActiveSessionId(null);
    setBlockedUrl(null);
    onFinished?.();
  }, [activeSessionId, onFinished]);

  const busy = phase !== "idle";
  const status = session?.status ?? (phase === "active" ? "awaiting_login" : null);
  const enrichTotal = session?.inventoryCount ?? 0;
  const showCounter = session != null && ["enriching", "results_available"].includes(session.status) && enrichTotal > 0;

  const progress = busy && (
    <div role="status" className="mt-3 rounded-xl border border-[#3d4668] bg-[#0d1220] p-3 text-xs leading-5 text-[#bdc9ff]">
      <p>{phase === "creating" ? "Abrindo sua sessão privada…" : STATUS_LABELS[status ?? "preparing"]}</p>
      {showCounter && <p className="mt-1 font-medium text-white">{session.enrichedCount} de {enrichTotal} perfis analisados</p>}
      {session?.status === "results_available" && <p className="mt-1 text-[#93d7bd]">Você já pode ver as primeiras recomendações.</p>}
      {blockedUrl && status === "awaiting_login" && (
        <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-11 items-center font-medium text-white underline underline-offset-4">
          Continuar nesta aba não funcionou? Abrir tela de login →
        </a>
      )}
      {phase === "active" && (
        <button type="button" onClick={stopNow} className="mt-2 flex min-h-11 items-center text-xs font-medium text-[#ffb0b0] underline underline-offset-4">
          Encerrar agora
        </button>
      )}
    </div>
  );

  const errorBox = error && (
    <div role="alert" className="mt-3 rounded-xl border border-[#5a3d44] bg-[#1c0f13] p-3 text-xs leading-5 text-[#ffc9c9]">
      {error}
      <button type="button" onClick={connect} className="mt-2 flex min-h-11 items-center font-medium text-white underline underline-offset-4">Tentar de novo</button>
    </div>
  );

  const trustLine = (
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">
      Login normal em tela isolada · Rede mapeada automaticamente · Sessão apagada ao concluir
    </p>
  );

  if (appearance === "card") {
    return (
      <div className="min-h-28 rounded-2xl border border-[#4d5b8a] bg-[#101526] p-4 text-left">
        <span className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0a66c2] text-lg font-semibold text-white">in</span>
          <span className={connected ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>
            {busy ? STATUS_LABELS[status ?? "preparing"] : connected ? `${contactCount} contatos` : "Não conectado"}
          </span>
        </span>
        <span className="mt-4 block font-medium text-white">Conecte sua rede</span>
        <span className="mt-1 block text-xs text-[var(--muted)]">Uma sessão privada será aberta. Entre diretamente no LinkedIn e deixe o mapeamento acontecer.</span>
        <button
          type="button"
          disabled={busy}
          onClick={connect}
          className="accent-button mt-4 flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Sessão em andamento…" : "Continuar com LinkedIn →"}
        </button>
        {progress}
        {errorBox}
        {trustLine}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-white">Conecte sua rede</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Uma sessão privada será aberta. Entre diretamente no LinkedIn e deixe o mapeamento acontecer.</p>
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className="accent-button mt-4 flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-medium disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Sessão em andamento…" : "Continuar com LinkedIn →"}
      </button>
      {progress}
      {errorBox}
      {trustLine}
    </div>
  );
}
