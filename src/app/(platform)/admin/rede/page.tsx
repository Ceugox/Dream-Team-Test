import { AdminNetworkConnections } from "@/components/platform/AdminNetworkConnections";
import { ManualAdminContact, PublicDiscovery } from "@/components/platform/AdminNetworkForms";
import { AdminNetworkList, type NetworkListContact } from "@/components/platform/AdminNetworkList";
import { PageHeader } from "@/components/platform/AppShell";
import { getAdminSession } from "@/lib/platform/auth";
import { areaLabel, inferArea } from "@/lib/platform/areaClassifier";
import { getAdminNetworkInsights, listAdminNetworkContacts, listAdminSourceConnections } from "@/lib/platform/repository";

export default async function AdminNetworkPage() {
  const session = (await getAdminSession())!;
  const [contacts, connections, insight] = await Promise.all([listAdminNetworkContacts(session.administratorId), listAdminSourceConnections(session.administratorId), getAdminNetworkInsights(session.administratorId)]);
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
    {insight && <section className="mt-6 rounded-2xl border border-[#405078] bg-[#101528] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Insights da rede</h2><span className="text-[10px] text-[var(--muted)]">{insight.source === "llm" ? "IA" : "Automático"} · {insight.contactsCount} contatos</span></div>
      {insight.areaDistribution.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{insight.areaDistribution.map(a => <span key={a.code} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[#c9d3ff]">{a.label} · {a.count}</span>)}</div>}
      {insight.summary && <p className="mt-4 text-sm leading-6 text-white/90">{insight.summary}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {insight.highlights.length > 0 && <div><p className="text-xs font-medium text-[#8ea7ff]">Pontos fortes</p><ul className="mt-2 space-y-1">{insight.highlights.map((h,i) => <li key={i} className="text-xs leading-5 text-[var(--muted)]">• {h}</li>)}</ul></div>}
        {insight.gaps.length > 0 && <div><p className="text-xs font-medium text-[var(--amber)]">Lacunas para priorizar</p><ul className="mt-2 space-y-1">{insight.gaps.map((g,i) => <li key={i} className="text-xs leading-5 text-[var(--muted)]">• {g}</li>)}</ul></div>}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">Gerado automaticamente em segundo plano após o último mapeamento{insight.model ? ` · ${insight.model}` : ""}.</p>
    </section>}
    <details className="group mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-medium sm:px-6">Adicionar contato manualmente<span aria-hidden="true" className="text-xl text-[var(--muted)] transition group-open:rotate-45">+</span></summary>
      <div className="border-t border-[var(--line)] p-4 sm:p-6"><p className="mb-5 text-xs leading-5 text-[var(--muted)]">Use esta opção somente para contatos que não estejam nas contas conectadas.</p><ManualAdminContact /></div>
    </details>
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Sua rede{contacts.length > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{contacts.length}</span>}</h2><span className="text-xs text-[var(--muted)]">Privada</span></div>
      <AdminNetworkList contacts={contacts.map((contact): NetworkListContact => {
        const label = contact.areaOverride ? areaLabel(contact.areaOverride) : inferArea({ headline: contact.headline, profileContext: contact.profileContext }).label;
        return { id: contact.id, name: contact.name, headline: contact.headline, profileContext: contact.profileContext,
          phone: contact.phone, source: contact.source, areaOverride: contact.areaOverride,
          areaLabelText: label ?? null, areaIsOverride: Boolean(contact.areaOverride),
          networkCapitalScore: contact.networkCapitalScore, networkCapitalEvidence: contact.networkCapitalEvidence,
          publicEnrichmentStatus: contact.publicEnrichmentStatus, publicSources: contact.publicSources };
      })} />
      {contacts.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">Conecte o LinkedIn ou o Google para gerar as primeiras recomendações.</p>}
      <p className="mt-5 text-[10px] leading-4 text-[var(--muted)]">Sua senha e seus cookies nunca entram na plataforma. Os dados profissionais são usados para recomendações e não para decisões automáticas de contratação.</p>
    </section>
  </>;
}

function Metric({ label, value, className = "" }: { label: string; value: number; className?: string }) { return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 ${className}`}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-medium">{value}</p></div>; }
