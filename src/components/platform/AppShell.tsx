import Link from "next/link";
import type { ReactNode } from "react";

const adminNav = [["/admin","Visão geral","⌂"],["/admin/vagas","Vagas","◇"],["/admin/equipe","Equipe","◎"],["/admin/indicacoes","Indicações","↗"]] as const;
const memberNav = [["/app","Início","⌂"],["/app/oportunidades","Oportunidades","✦"],["/app/conexoes","Conexões","⌁"]] as const;

export function AppShell({ mode, name, children }: { mode: "admin" | "member"; name: string; children: ReactNode }) {
  const nav = mode === "admin" ? adminNav : memberNav;
  return <div className="min-h-screen bg-[var(--background)]">
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[#08090d]/90 px-5 backdrop-blur-xl lg:px-8">
      <Link href={mode === "admin" ? "/admin" : "/app"} className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-lg border border-[#5064a1] bg-gradient-to-br from-[#17244b] to-[#351e48] font-mono text-[#a8bbff]">›_</span>Referral Copilot</Link>
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]"><span className="hidden sm:block">{mode === "admin" ? "Workspace administrativo" : "Rede privada"}</span><span className="h-4 w-px bg-[var(--line)]"/><span className="hidden text-white sm:block">{name}</span><form action="/api/logout" method="post"><button className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[#b5bbc7] hover:border-[#536595] hover:text-white">Sair</button></form></div>
    </header>
    <aside className="fixed bottom-0 left-0 top-16 hidden w-60 border-r border-[var(--line)] bg-[#0a0c11] p-4 lg:block"><p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.16em] text-[var(--muted)]">{mode === "admin" ? "Operação" : "Minha área"}</p><nav className="space-y-1">{nav.map(([href,label,icon]) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#aeb4c0] transition hover:bg-[var(--surface-2)] hover:text-white"><span className="w-5 text-center text-[#8197dd]">{icon}</span>{label}</Link>)}</nav><div className="absolute bottom-5 left-4 right-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]"><span className="mb-2 block text-[var(--green)]">● Privacidade ativa</span>{mode === "admin" ? "Você só vê indicações consentidas." : "Nada é compartilhado sem sua confirmação."}</div></aside>
    <main className="min-h-screen px-5 pb-24 pt-24 lg:ml-60 lg:px-10 lg:pb-10">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--line)] bg-[#090a0e]/95 p-2 backdrop-blur lg:hidden">{nav.map(([href,label,icon]) => <Link key={href} href={href} className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] text-[var(--muted)]"><span className="text-base text-[#8197dd]">{icon}</span>{label}</Link>)}</nav>
  </div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[.18em] text-[#8ea7ff]">{eyebrow}</p><h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p></div>{action}</div>;
}

export function MetricCard({ label, value, hint, tone="blue" }: { label: string; value: string | number; hint: string; tone?: "blue" | "green" | "violet" | "amber" }) {
  const colors = { blue:"text-[#8ea7ff]", green:"text-[var(--green)]", violet:"text-[#c09cff]", amber:"text-[var(--amber)]" };
  return <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-3xl font-medium tracking-tight">{value}</p><p className={`mt-3 text-xs ${colors[tone]}`}>{hint}</p></div>;
}
