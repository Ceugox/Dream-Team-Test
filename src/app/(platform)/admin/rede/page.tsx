import { AdminNetworkConnections } from "@/components/platform/AdminNetworkConnections";
import { ManualAdminContact, PublicDiscovery } from "@/components/platform/AdminNetworkForms";
import { PageHeader } from "@/components/platform/AppShell";
import { getAdminSession } from "@/lib/platform/auth";
import { inferArea } from "@/lib/platform/areaClassifier";
import { listAdminNetworkContacts, listAdminSourceConnections } from "@/lib/platform/repository";

export default async function AdminNetworkPage() {
  const session = (await getAdminSession())!;
  const [contacts, connections] = await Promise.all([listAdminNetworkContacts(session.administratorId), listAdminSourceConnections(session.administratorId)]);
  const phones = contacts.filter(item => item.phone).length;
  const enriched = contacts.filter(item => item.publicEnrichmentStatus === "enriched").length;
  const linkedinCount = contacts.filter(item => item.source === "linkedin").length;
  const linkedin = connections.find(item => item.provider === "linkedin");
  const google = connections.find(item => item.provider === "google");
  const googleCount = contacts.filter(item => item.source === "google").length;
  const googleConfigured = Boolean((process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) && (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET));

  return <>
    <PageHeader eyebrow="Inteligência coletiva" title="Minha rede" description="Conecte suas contas e deixe a plataforma encontrar quem pode indicar os melhores candidatos." />
    <AdminNetworkConnections linkedinConnected={linkedin?.status === "connected"} linkedinCount={linkedinCount} googleConnected={google?.status === "connected"} googleCount={googleCount} googleAccountEmail={google?.accountEmail ?? null} googleConfigured={googleConfigured} />
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="Contatos privados" value={contacts.length} /><Metric label="Com WhatsApp" value={phones} /><Metric label="Perfis enriquecidos" value={enriched} className="col-span-2 sm:col-span-1" /></div>
    {contacts.length > 0 && <div className="mt-6"><PublicDiscovery /></div>}
    <details className="group mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-medium sm:px-6">Adicionar contato manualmente<span aria-hidden="true" className="text-xl text-[var(--muted)] transition group-open:rotate-45">+</span></summary>
      <div className="border-t border-[var(--line)] p-4 sm:p-6"><p className="mb-5 text-xs leading-5 text-[var(--muted)]">Use esta opção somente para contatos que não estejam nas contas conectadas.</p><ManualAdminContact /></div>
    </details>
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Sua rede{contacts.length > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{contacts.length}</span>}</h2><span className="text-xs text-[var(--muted)]">Privada</span></div>
      <div className="mt-4 grid max-h-[70vh] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">{contacts.map(contact => <div key={contact.id} className="rounded-xl border border-[var(--line)] bg-[#0c0e13] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium break-words">{contact.headline || "Contexto ainda incompleto"}</p><SourceBadge source={contact.source} /><AreaBadge headline={contact.headline} profileContext={contact.profileContext} /></div><p className="mt-1 text-xs leading-5 text-[var(--muted)] break-words">{contact.name}</p>{contact.networkCapitalEvidence.length > 0 && <p className="mt-2 text-[10px] leading-4 text-[#b9a9ff]">Capital de rede: {contact.networkCapitalEvidence.join(" · ")}</p>}{contact.publicSources.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{contact.publicSources.slice(0, 2).map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#8ea7ff] underline underline-offset-2">{source.title}</a>)}</div>}</div><div className="shrink-0 text-right"><span className={contact.phone ? "block text-xs text-[var(--green)]" : "block text-xs text-[var(--amber)]"}>{contact.phone ? "WhatsApp ✓" : "Sem número"}</span>{contact.publicEnrichmentStatus === "enriched" && <span className="mt-2 block text-[10px] text-[var(--green)]">Fonte confirmada</span>}{contact.publicEnrichmentStatus === "unconfirmed" && <span className="mt-2 block text-[10px] text-[var(--amber)]">Identidade ambígua</span>}{contact.networkCapitalScore > 0 && <span className="mt-2 block text-[10px] text-[#b9a9ff]">{Math.round(contact.networkCapitalScore * 100)}% sinal</span>}</div></div></div>)}</div>
      {contacts.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">Conecte o LinkedIn ou o Google para gerar as primeiras recomendações.</p>}
      <p className="mt-5 text-[10px] leading-4 text-[var(--muted)]">Sua senha e seus cookies nunca entram na plataforma. Os dados profissionais são usados para recomendações e não para decisões automáticas de contratação.</p>
    </section>
  </>;
}

function Metric({ label, value, className = "" }: { label: string; value: number; className?: string }) { return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 ${className}`}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-medium">{value}</p></div>; }
function AreaBadge({ headline, profileContext }: { headline: string | null; profileContext: string | null }) { const area = inferArea({ headline, profileContext }); if (!area.label) return null; return <span className="rounded-full border border-[#3a3357] bg-[#1a1630] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#b9a9ff]">{area.label}</span>; }
function SourceBadge({ source }: { source: string }) { const label = source === "google" ? "Google" : source === "linkedin" ? "LinkedIn" : "Manual"; return <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">{label}</span>; }
