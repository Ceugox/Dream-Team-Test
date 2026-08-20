"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminNetworkImport } from "./AdminNetworkForms";

type Props = {
  linkedinCount: number;
  googleConnected: boolean;
  googleCount: number;
  googleAccountEmail: string | null;
  googleConfigured: boolean;
};

export function AdminNetworkConnections(props: Props) {
  const router = useRouter();
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [message, setMessage] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!linkedinOpen) return;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setLinkedinOpen(false);
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [linkedinOpen]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data?.type) return;
      if (event.data.type === "rc:google-connected") {
        setMessage(`${event.data.count ?? 0} contatos do Google conectados.`);
        router.refresh();
      } else if (event.data.type === "rc:google-error" || event.data.type === "rc:google-unavailable") {
        setMessage(event.data.message || "Não foi possível conectar o Google agora.");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [router]);

  function connectGoogle() {
    setMessage("");
    if (!props.googleConfigured) {
      setMessage("A conexão Google precisa ser ativada uma única vez nas configurações do ambiente.");
      return;
    }
    const width = 520;
    const height = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open("/api/admin/network/google/start", "rc-google-connect", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) setMessage("Seu navegador bloqueou a janela. Permita pop-ups e tente novamente.");
  }

  return <section aria-labelledby="network-connections-title" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
    <div className="max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a99cff]">Comece por aqui</p>
      <h2 id="network-connections-title" className="mt-2 text-xl font-medium">Conecte suas fontes</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Escolha uma conta. Você revisa e autoriza os dados antes de qualquer importação.</p>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <button type="button" onClick={() => setLinkedinOpen(true)} className="group min-h-28 rounded-2xl border border-[#4d5b8a] bg-[#101526] p-4 text-left transition hover:border-[#8495dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a99cff]">
        <span className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0a66c2] text-lg font-semibold text-white">in</span>
          <span className={props.linkedinCount ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>{props.linkedinCount ? `${props.linkedinCount} contatos` : "Não conectado"}</span>
        </span>
        <span className="mt-4 block font-medium text-white">Conectar LinkedIn</span>
        <span className="mt-1 block text-xs text-[var(--muted)]">Abrir conexão segura →</span>
      </button>

      <button type="button" onClick={connectGoogle} className="group min-h-28 rounded-2xl border border-[#4b5060] bg-[#12141a] p-4 text-left transition hover:border-[#8c93a4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a99cff]">
        <span className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-lg font-semibold text-[#4285f4]">G</span>
          <span className={props.googleConnected ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>{props.googleConnected ? `${props.googleCount} contatos` : "Não conectado"}</span>
        </span>
        <span className="mt-4 block font-medium text-white">Conectar Google</span>
        <span className="mt-1 block truncate text-xs text-[var(--muted)]">{props.googleAccountEmail || "Google Contacts"} →</span>
      </button>
    </div>
    {message && <p role="status" className="mt-4 rounded-xl border border-[#3d4668] bg-[#0d1220] p-3 text-xs leading-5 text-[#bdc9ff]">{message}</p>}

    {linkedinOpen && <div className="fixed inset-0 z-50 grid items-end bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && setLinkedinOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="linkedin-dialog-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-[#465174] bg-[#10131d] p-5 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-medium text-[#8ebaf0]">LinkedIn</p><h3 id="linkedin-dialog-title" className="mt-1 text-xl font-medium">Conectar minha rede</h3></div>
          <button ref={closeButton} type="button" aria-label="Fechar" onClick={() => setLinkedinOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xl text-[var(--muted)] hover:text-white">×</button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">O LinkedIn não libera conexões pela integração padrão. Por isso, abrimos sua própria conta e você traz somente o arquivo gerado localmente. A plataforma nunca recebe sua senha ou cookies.</p>
        <ol className="mt-5 grid gap-3 text-sm">
          <li className="rounded-xl border border-[var(--line)] bg-[#0b0e15] p-4"><span className="mr-2 text-[#9eb2ff]">1.</span>Abra sua lista de conexões no LinkedIn.</li>
          <li className="rounded-xl border border-[var(--line)] bg-[#0b0e15] p-4"><span className="mr-2 text-[#9eb2ff]">2.</span>Execute o extrator local e salve o arquivo.</li>
          <li className="rounded-xl border border-[var(--line)] bg-[#0b0e15] p-4"><span className="mr-2 text-[#9eb2ff]">3.</span>Selecione o arquivo abaixo para concluir.</li>
        </ol>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a href="https://www.linkedin.com/mynetwork/invite-connect/connections/" target="_blank" rel="noreferrer" className="accent-button inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-center text-sm font-medium">Abrir meu LinkedIn</a>
          <a href="/linkedin-console-script.js" download className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--line)] px-4 text-center text-sm font-medium text-white">Baixar extrator local</a>
        </div>
        <div className="mt-5 border-t border-[var(--line)] pt-5"><AdminNetworkImport onDone={() => setLinkedinOpen(false)} /></div>
      </div>
    </div>}
  </section>;
}
