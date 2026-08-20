import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminLoginForm } from "@/components/platform/AdminLoginForm";
import { isAdmin } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";
export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <main className="subtle-grid relative grid min-h-screen place-items-center overflow-hidden px-5"><div className="pointer-events-none absolute left-1/2 top-[-240px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(73,103,188,.24),rgba(103,57,144,.08)_45%,transparent_70%)]"/><section className="glass relative w-full max-w-md rounded-3xl p-7 shadow-2xl md:p-9"><Link href="/" className="flex items-center gap-3 font-semibold"><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl border border-[#5064a1] bg-gradient-to-br from-[#17244b] to-[#351e48] font-mono text-[#a8bbff]">›_</span>Referral Copilot</Link><p className="mt-10 font-mono text-[10px] uppercase tracking-[.18em] text-[#8ea7ff]">Acesso do administrador</p><h1 className="gradient-text mt-3 text-3xl font-medium tracking-tight">Transforme redes em indicações.</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Crie vagas, ative sua equipe e receba candidatos que cada pessoa escolheu compartilhar.</p><AdminLoginForm/><p className="mt-6 text-center text-xs text-[var(--muted)]">A rede de cada membro permanece privada por padrão.</p><Link href="/" className="mt-5 block text-center text-xs text-[#9eb2ff] hover:text-white">← Voltar para a escolha de acesso</Link></section></main>;
}
