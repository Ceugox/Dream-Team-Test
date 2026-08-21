"use client";

import { useRouter } from "next/navigation";
import { LinkedInExtensionConnector } from "./LinkedInExtensionConnector";

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

  return <section aria-labelledby="network-connections-title" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
    <div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a99cff]">Comece por aqui</p><h2 id="network-connections-title" className="mt-2 text-xl font-medium">Conecte suas fontes</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">A conexão acontece pelo conector do navegador, usando o seu próprio login no LinkedIn. Nenhuma senha passa pela plataforma.</p></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <LinkedInExtensionConnector appearance="card" connected={props.linkedinConnected} contactCount={props.linkedinCount} endpoint="/api/admin/network" onFinished={() => router.refresh()} />
      <div aria-disabled="true" className="min-h-28 rounded-2xl border border-dashed border-[#3a3f4c] bg-[#0e1015] p-4 text-left opacity-70">
        <span className="flex items-center justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2a2d36] text-lg font-semibold text-[#8c93a4]">G</span>
          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">Implementação futura</span>
        </span>
        <span className="mt-4 block font-medium text-[#c3c8d4]">Conectar Google</span>
        <span className="mt-1 block text-xs text-[var(--muted)]">Importação do Google Contacts ainda não disponível.</span>
      </div>
    </div>
  </section>;
}
