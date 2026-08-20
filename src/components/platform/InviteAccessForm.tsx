"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { extractInviteToken } from "@/lib/platform/inviteAccess";

export function InviteAccessForm() {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = extractInviteToken(invite);
    if (!token) {
      setError("Cole um link de convite válido ou informe o código recebido.");
      return;
    }
    setError("");
    router.push(`/join/${encodeURIComponent(token)}`);
  }

  return <form onSubmit={submit} className="mt-8">
    <label htmlFor="invite-access" className="text-xs text-[#c7d0cd]">Link ou código do convite</label>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input id="invite-access" value={invite} onChange={event => setInvite(event.target.value)} required autoComplete="off" spellCheck={false} className="min-w-0 flex-1 rounded-xl border border-[#315b4c] bg-[#09110f] px-4 py-3.5 text-sm text-white placeholder:text-[#586661]" placeholder="Cole o convite recebido"/>
      <button className="rounded-xl border border-[#35715c] bg-[#17382d] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#1d4638]">Acessar</button>
    </div>
    {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : <p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">O convite é individual e expira em 7 dias.</p>}
  </form>;
}
