import Link from "next/link";
import { InviteAccessForm } from "@/components/platform/InviteAccessForm";
import { getMemberSession, isAdmin } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

const adminCapabilities = [
  "Publicar as vagas prioritárias",
  "Convidar e ativar a equipe",
  "Conduzir indicações consentidas",
];

const memberCapabilities = [
  "Importar sua rede com privacidade",
  "Revisar oportunidades relevantes",
  "Escolher cada pessoa que deseja indicar",
];

function CapabilityList({ items }: { items: string[] }) {
  return <ul className="mt-7 space-y-3 text-sm text-[#b9c0cd]">{items.map(item => <li key={item} className="flex items-center gap-3"><span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#182c25] text-[10px] text-[var(--green)]">✓</span>{item}</li>)}</ul>;
}

export default async function Home() {
  const [adminActive, memberSession] = await Promise.all([isAdmin(), getMemberSession()]);

  return <main id="conteudo" className="subtle-grid relative min-h-dvh overflow-hidden px-4 py-4 sm:px-5 sm:py-5 md:px-8 md:py-7">
    <a href="#acessos" className="sr-only rounded-lg bg-white px-4 py-2 text-black focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Ir para os acessos</a>
    <div className="pointer-events-none absolute left-1/2 top-[-420px] h-[760px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(77,109,214,.24),rgba(114,60,161,.1)_43%,transparent_70%)]"/>
    <div className="pointer-events-none absolute bottom-[-340px] right-[-260px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(88,214,168,.1),transparent_68%)]"/>

    <header className="relative mx-auto flex max-w-6xl items-center justify-between">
      <Link href="/" aria-label="Referral Copilot - página inicial" className="flex items-center gap-3 font-semibold tracking-tight">
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl border border-[#5064a1] bg-gradient-to-br from-[#17244b] to-[#351e48] font-mono text-[#a8bbff] shadow-lg shadow-[#263663]/20">›_</span>
        <span className="hidden min-[350px]:inline">Referral Copilot</span>
      </Link>
      <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[#0b0d12]/80 px-3 py-2 text-[10px] text-[var(--muted)] backdrop-blur">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--green)] shadow-[0_0_12px_rgba(88,214,168,.7)]"/>
        <span className="min-[380px]:hidden">Privacidade</span><span className="hidden min-[380px]:inline">Privacidade ativa</span>
      </div>
    </header>

    <section className="relative mx-auto max-w-6xl pb-7 pt-12 text-center sm:pt-16 md:pb-10 md:pt-20">
      <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#8ea7ff]">Inteligência de indicação</p>
      <h1 className="gradient-text mx-auto mt-5 max-w-4xl text-[2.15rem] font-medium leading-[1.08] tracking-[-.035em] text-balance min-[380px]:text-4xl sm:text-5xl md:text-6xl">Um ponto de entrada.<br/>Duas experiências privadas.</h1>
      <p className="mx-auto mt-6 max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-base md:leading-7">Administradores organizam vagas e indicações. Usuários exploram a própria rede e decidem o que compartilhar.</p>
    </section>

    <section id="acessos" aria-label="Escolha seu tipo de acesso" className="relative mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
      <article className="access-card group relative overflow-hidden rounded-2xl border border-[#35415f] bg-[linear-gradient(145deg,rgba(19,24,39,.96),rgba(12,14,20,.96))] p-5 shadow-2xl shadow-black/20 sm:rounded-3xl sm:p-6 md:p-8">
        <div className="absolute right-[-60px] top-[-70px] h-48 w-48 rounded-full bg-[#5878ef]/10 blur-3xl transition group-hover:bg-[#5878ef]/15"/>
        <div className="relative">
          <div className="flex items-start justify-between gap-4"><span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl border border-[#425486] bg-[#151d33] text-xl text-[#9eb2ff]">◇</span>{adminActive&&<span className="rounded-full border border-[#27513f] bg-[#13271f] px-3 py-1.5 text-[10px] text-[var(--green)]">Sessão ativa</span>}</div>
          <p className="mt-7 font-mono text-[10px] uppercase tracking-[.18em] text-[#8ea7ff]">Administrador</p>
          <h2 className="mt-3 text-2xl font-medium tracking-tight">Conduza a operação.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:min-h-12">Crie oportunidades, mobilize sua equipe e acompanhe apenas candidatos compartilhados com consentimento.</p>
          <CapabilityList items={adminCapabilities}/>
          <Link href={adminActive ? "/admin" : "/admin/login"} className="accent-button mt-8 flex w-full items-center justify-between rounded-xl px-5 py-3.5 text-sm font-medium text-white transition hover:brightness-110">
            {adminActive ? "Continuar no painel" : "Entrar como administrador"}<span aria-hidden="true">→</span>
          </Link>
        </div>
      </article>

      <article className="access-card group relative overflow-hidden rounded-2xl border border-[#2e4c43] bg-[linear-gradient(145deg,rgba(16,30,27,.9),rgba(12,14,20,.97)_58%)] p-5 shadow-2xl shadow-black/20 sm:rounded-3xl sm:p-6 md:p-8">
        <div className="absolute right-[-60px] top-[-70px] h-48 w-48 rounded-full bg-[#58d6a8]/10 blur-3xl transition group-hover:bg-[#58d6a8]/15"/>
        <div className="relative">
          <div className="flex items-start justify-between gap-4"><span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl border border-[#315b4c] bg-[#11271f] text-xl text-[#7ee3bd]">⌁</span>{memberSession&&<span className="rounded-full border border-[#27513f] bg-[#13271f] px-3 py-1.5 text-[10px] text-[var(--green)]">Sessão ativa</span>}</div>
          <p className="mt-7 font-mono text-[10px] uppercase tracking-[.18em] text-[#70d5af]">Usuário convidado</p>
          <h2 className="mt-3 text-2xl font-medium tracking-tight">Ative sua rede.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:min-h-12">Encontre pessoas relevantes para vagas reais sem expor sua lista de contatos ao administrador.</p>
          <CapabilityList items={memberCapabilities}/>
          {memberSession ? <Link href="/app" className="mt-8 flex w-full items-center justify-between rounded-xl border border-[#35715c] bg-[#17382d] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#1d4638]">Continuar na minha área<span aria-hidden="true">→</span></Link> : <InviteAccessForm/>}
        </div>
      </article>
    </section>

    <footer className="relative mx-auto mt-8 flex max-w-5xl flex-col items-center justify-between gap-3 border-t border-[var(--line)] py-6 text-center text-[10px] text-[var(--muted)] sm:flex-row sm:text-left">
      <p>Redes privadas por padrão. Compartilhamento somente com confirmação.</p>
      <p className="font-mono uppercase tracking-[.14em]">Built for trusted referrals</p>
    </footer>
  </main>;
}
