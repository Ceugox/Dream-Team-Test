"use client";

// Estado da sessão de navegador remoto. O fluxo remoto foi descontinuado como porta de
// entrada (a conexão hoje é só pelo conector/extensão), mas estes hooks continuam servindo
// a tela /linkedin/session/[id] e as sessões já existentes.
import { useEffect, useRef, useState } from "react";

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

