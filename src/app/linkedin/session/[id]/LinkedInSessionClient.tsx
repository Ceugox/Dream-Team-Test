"use client";

import { useSyncExternalStore } from "react";
import {
  cancelLinkedInSession,
  liveUrlStorageKey,
  STATUS_LABELS,
  useLinkedInSessionStream,
  type PublicLinkedInSessionDto,
} from "@/components/platform/LinkedInRemoteConnector";

type Props = {
  sessionId: string | null;
  initialSession: PublicLinkedInSessionDto | null;
  homePath: string;
};

const TERMINAL_STATUSES = ["completed", "cancelled", "failed", "expired"];

export function LinkedInSessionClient({ sessionId, initialSession, homePath }: Props) {
  const { session, setSession } = useLinkedInSessionStream(sessionId, initialSession);
  const liveUrl = useSyncExternalStore(
    () => () => undefined,
    () => (sessionId ? sessionStorage.getItem(liveUrlStorageKey(sessionId)) : null),
    () => null,
  );

  async function stopNow() {
    if (!sessionId) return;
    const cancelled = await cancelLinkedInSession(sessionId);
    if (cancelled) setSession(cancelled);
  }

  const status = session?.status ?? "preparing";
  const terminal = TERMINAL_STATUSES.includes(status);
  const showLogin = status === "awaiting_login" && liveUrl;
  const showCounter = session != null && ["enriching", "results_available"].includes(status) && session.inventoryCount > 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 overflow-x-hidden px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a99cff]">Sessão privada do LinkedIn</p>
      <h1 className="text-xl font-medium text-white">
        {sessionId ? "Conectando sua rede" : "Preparando sua sessão segura…"}
      </h1>
      <div role="status" aria-live="polite" className="rounded-2xl border border-[#3d4668] bg-[#0d1220] p-4 text-sm leading-6 text-[#bdc9ff]">
        <p>{STATUS_LABELS[status] ?? status}</p>
        {showCounter && session && (
          <p className="mt-2 font-medium text-white">{session.enrichedCount} de {session.inventoryCount} perfis analisados</p>
        )}
        {status === "results_available" && (
          <p className="mt-2 text-[#93d7bd]">Você já pode voltar ao painel para ver as primeiras recomendações.</p>
        )}
      </div>
      {showLogin && (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="accent-button flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-medium"
        >
          Abrir tela de login segura →
        </a>
      )}
      {!terminal && sessionId && (
        <button
          type="button"
          onClick={stopNow}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[#5a3d44] px-4 py-2.5 text-sm text-[#ffb0b0]"
        >
          Encerrar agora
        </button>
      )}
      <a href={homePath} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm text-white">
        Voltar ao painel
      </a>
      <p className="text-[10px] leading-4 text-[var(--muted)]">
        Login normal em tela isolada · Rede mapeada automaticamente · Sessão apagada ao concluir
      </p>
    </main>
  );
}
