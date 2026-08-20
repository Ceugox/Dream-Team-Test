"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [key,setKey] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ key,name,email }) });
    if (!response.ok) { setError("Chave inválida. Verifique o acesso administrativo."); setLoading(false); return; }
    router.push("/admin"); router.refresh();
  }
  const field="mt-2 w-full rounded-xl border border-[var(--line)] bg-[#0b0d12] px-4 py-3.5 text-white placeholder:text-[#616876]";
  return <form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm text-[#c9ced8]">Seu nome<input autoFocus required value={name} onChange={e=>setName(e.target.value)} className={field} placeholder="Marina Costa"/></label><label className="block text-sm text-[#c9ced8]">E-mail profissional<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field} placeholder="marina@empresa.com"/></label><label className="block text-sm text-[#c9ced8]">Chave de acesso<input required type="password" value={key} onChange={e=>setKey(e.target.value)} className={field} placeholder="Digite sua chave administrativa"/></label><button disabled={loading} className="accent-button w-full rounded-xl px-5 py-3.5 font-medium text-white disabled:opacity-60">{loading?"Validando…":"Entrar no workspace"}</button>{error&&<p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}</form>;
}
