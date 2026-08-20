"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLinkedInBrowserSync } from "./useLinkedInBrowserSync";

type Props = {
  linkedinConnected: boolean;
  linkedinCount: number;
  googleConnected: boolean;
  googleCount: number;
  googleAccountEmail: string | null;
  googleConfigured: boolean;
};

export function AdminNetworkConnections(props: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const linkedin = useLinkedInBrowserSync({ endpoint: "/api/admin/network", onComplete: () => router.refresh() });

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data?.type) return;
      if (event.data.source === "referral-copilot-extension") return;
      if (event.data.type === "rc:google-connected") { setMessage(event.data.message || `${event.data.count ?? 0} contatos conectados.`); router.refresh(); }
      else if (event.data.type === "rc:google-error" || event.data.type === "rc:google-unavailable") setMessage(event.data.message || "Não foi possível conectar o Google agora.");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [router]);

  function connectGoogle() {
    setMessage("");
    if (!props.googleConfigured) { setMessage("A conexão Google precisa ser ativada uma única vez nas configurações do ambiente."); return; }
    const width = 520, height = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2), top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open("/api/admin/network/google/start", "rc-google-connect", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) setMessage("Seu navegador bloqueou a janela. Permita pop-ups e tente novamente.");
  }

  return <section aria-labelledby="network-connections-title" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
    <div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a99cff]">Comece por aqui</p><h2 id="network-connections-title" className="mt-2 text-xl font-medium">Conecte suas fontes</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Clique e entre na sua conta. A leitura acontece no seu próprio navegador.</p></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <button type="button" disabled={linkedin.syncing} onClick={linkedin.connect} className="group min-h-28 rounded-2xl border border-[#4d5b8a] bg-[#101526] p-4 text-left transition hover:border-[#8495dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a99cff] disabled:opacity-60">
        <span className="flex items-center justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#0a66c2] text-lg font-semibold text-white">in</span><span className={props.linkedinConnected ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>{linkedin.syncing ? "Sincronizando…" : props.linkedinConnected ? `${props.linkedinCount} contatos` : "Não conectado"}</span></span>
        <span className="mt-4 block font-medium text-white">Conectar LinkedIn</span><span className="mt-1 block text-xs text-[var(--muted)]">Entrar em uma nova aba e mapear →</span>
      </button>
      <button type="button" onClick={connectGoogle} className="group min-h-28 rounded-2xl border border-[#4b5060] bg-[#12141a] p-4 text-left transition hover:border-[#8c93a4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a99cff]">
        <span className="flex items-center justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white text-lg font-semibold text-[#4285f4]">G</span><span className={props.googleConnected ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>{props.googleConnected ? `${props.googleCount} contatos` : "Não conectado"}</span></span>
        <span className="mt-4 block font-medium text-white">Conectar Google</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{props.googleAccountEmail || "Google Contacts"} →</span>
      </button>
    </div>
    {(linkedin.message || message) && <div role="status" className="mt-4 rounded-xl border border-[#3d4668] bg-[#0d1220] p-3 text-xs leading-5 text-[#bdc9ff]">{linkedin.message || message}{linkedin.extensionMissing && <a href="/referral-copilot-linkedin-connector.zip" download className="mt-2 flex min-h-10 items-center font-medium text-white underline underline-offset-4">Instalar conector para Chrome ou Edge</a>}</div>}
    <p className="mt-4 text-[10px] leading-4 text-[var(--muted)]">O conector lê somente dados profissionais exibidos na página de conexões. Senha e cookies permanecem no navegador.</p>
  </section>;
}
