"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [key,setKey] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ key }) });
    if (!response.ok) { setError("Chave inválida. Verifique o acesso administrativo."); setLoading(false); return; }
    router.push("/admin"); router.refresh();
  }
  return <form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm text-[#c9ced8]">Chave de acesso<input autoFocus required type="password" value={key} onChange={e=>setKey(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#0b0d12] px-4 py-3.5 text-white placeholder:text-[#616876]" placeholder="Digite sua chave administrativa"/></label><button disabled={loading} className="accent-button w-full rounded-xl px-5 py-3.5 font-medium text-white disabled:opacity-60">{loading?"Validando…":"Entrar no workspace"}</button>{error&&<p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}</form>;
}
