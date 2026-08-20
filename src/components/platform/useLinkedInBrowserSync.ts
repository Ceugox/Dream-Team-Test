"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  endpoint: string;
  onComplete?: (count: number) => void;
};

export function useLinkedInBrowserSync({ endpoint, onComplete }: Options) {
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [extensionMissing, setExtensionMissing] = useState(false);
  const extensionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== "referral-copilot-extension") return;

      if (event.data.type === "rc:linkedin-extension-ready") {
        if (extensionTimer.current) clearTimeout(extensionTimer.current);
        setExtensionMissing(false);
        setMessage("LinkedIn aberto em uma nova aba. Faça login normalmente por lá.");
      } else if (event.data.type === "rc:linkedin-awaiting-login") {
        setMessage("Faça login normalmente no LinkedIn. A sincronização continuará sozinha depois.");
      } else if (event.data.type === "rc:linkedin-collecting") {
        setMessage("Login confirmado. Estamos mapeando suas conexões visíveis…");
      } else if (event.data.type === "rc:linkedin-sync-progress") {
        setMessage(`${event.data.count ?? 0} conexões encontradas…`);
      } else if (event.data.type === "rc:linkedin-sync-complete") {
        setMessage("Salvando sua rede com segurança…");
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "browser-sync", contacts: event.data.contacts }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error("sync_failed");
          setMessage(`${data.count} conexões sincronizadas. Tudo pronto.`);
          onCompleteRef.current?.(data.count);
        } catch {
          setMessage("A leitura terminou, mas não foi possível salvar a rede. Tente novamente.");
        } finally {
          setSyncing(false);
        }
      } else if (event.data.type === "rc:linkedin-sync-error") {
        setMessage(event.data.message || "A sincronização do LinkedIn foi interrompida.");
        setSyncing(false);
      }
    };

    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (extensionTimer.current) clearTimeout(extensionTimer.current);
    };
  }, [endpoint]);

  const connect = useCallback(() => {
    setMessage("Abrindo o LinkedIn…");
    setExtensionMissing(false);
    setSyncing(true);
    window.postMessage({ source: "referral-copilot-app", type: "rc:start-linkedin-sync" }, window.location.origin);
    extensionTimer.current = setTimeout(() => {
      setExtensionMissing(true);
      setSyncing(false);
      setMessage("Instale o conector uma única vez para liberar a conexão em um clique.");
    }, 1800);
  }, []);

  return { connect, extensionMissing, message, syncing };
}
