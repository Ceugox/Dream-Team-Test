"use client";

import { useLinkedInBrowserSync } from "./useLinkedInBrowserSync";

type Props = {
  connected: boolean;
  contactCount: number;
  appearance: "card" | "cta";
  /** Endpoint que recebe as conexões coletadas pela extensão (browser-sync). */
  endpoint: string;
  onFinished?: () => void;
};

// A sincronização acontece exclusivamente pelo conector local (extensão do Chrome/Edge):
// o login é feito na própria sessão do usuário no LinkedIn e nada de credencial passa pela
// plataforma. O fluxo de navegador remoto foi descontinuado.
export function LinkedInExtensionConnector({ connected, contactCount, appearance, endpoint, onFinished }: Props) {
  const sync = useLinkedInBrowserSync({ endpoint, onComplete: () => onFinished?.() });

  const status = sync.syncing ? "Sincronizando pelo conector…" : connected ? `${contactCount} contatos` : "Não conectado";

  const feedback = sync.message && (
    <div role="status" className="mt-3 rounded-xl border border-[#3d4668] bg-[#0d1220] p-3 text-xs leading-5 text-[#bdc9ff]">
      {sync.message}
      {sync.extensionMissing && (
        <a href="/referral-copilot-linkedin-connector.zip" download className="mt-2 flex min-h-11 items-center font-medium text-white underline underline-offset-4">
          Baixar conector para Chrome ou Edge
        </a>
      )}
    </div>
  );

  const trustLine = (
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">
      Login na sua própria sessão do LinkedIn · Somente conexões visíveis · Nenhuma senha passa pela plataforma
    </p>
  );

  const description = "O conector abre o LinkedIn em uma nova aba e mapeia suas conexões visíveis. Instale uma única vez.";
  const label = sync.syncing ? "Sincronizando…" : "Conectar pelo conector →";

  if (appearance === "card") {
    return (
      <div className="min-h-28 rounded-2xl border border-[#4d5b8a] bg-[#101526] p-4 text-left">
        <span className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0a66c2] text-lg font-semibold text-white">in</span>
          <span className={connected && !sync.syncing ? "text-xs text-[var(--green)]" : "text-xs text-[var(--muted)]"}>{status}</span>
        </span>
        <span className="mt-4 block font-medium text-white">Conecte sua rede</span>
        <span className="mt-1 block text-xs text-[var(--muted)]">{description}</span>
        <button type="button" disabled={sync.syncing} onClick={sync.connect} className="accent-button mt-4 flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60">
          {label}
        </button>
        {feedback}
        {trustLine}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-white">Conecte sua rede</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
      <button type="button" disabled={sync.syncing} onClick={sync.connect} className="accent-button mt-4 flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-medium disabled:opacity-50 sm:w-auto">
        {label}
      </button>
      {feedback}
      {trustLine}
    </div>
  );
}
