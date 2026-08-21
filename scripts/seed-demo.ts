/**
 * Popula o sistema para demonstração: vagas, rede distribuída entre membros, indicações ao
 * longo do funil e mensagens de outreach preparadas.
 *
 * Usa as conexões QUE JÁ EXISTEM no banco de destino (as do admin, vindas do conector do
 * LinkedIn) — não inventa pessoas. Só o e-mail dos membros é sintético (@demo.local), porque
 * convite exige e-mail e não temos o real.
 *
 * SEED_SPOTLIGHT recebe nomes que precisam aparecer nas indicações. Para cada um, o script lê
 * a headline real da pessoa e gera uma vaga sob medida (cargo e requisitos tirados do próprio
 * perfil), garantindo que ela entre como candidata e depois seja indicada.
 *
 * Uso:
 *   DATABASE_URL=... APP_SECRET=... SEED_CONFIRM=yes npx tsx scripts/seed-demo.ts
 *
 * Idempotente: vaga existente pelo título é reaproveitada, membro existente pelo e-mail é
 * reaproveitado e indicação repetida cai no ON CONFLICT do submitReferral. Sem chamada a LLM.
 */
import { query } from "../src/lib/platform/db";
import {
  acceptInvitation, createInvitation, createJob, createOutreachRequests, listJobRecommendations,
  listJobs, listRankedOpportunities, seedJobRecommendations, submitReferral, updateReferralStatus,
  upsertNetworkContacts,
} from "../src/lib/platform/repository";
import { areaLabel, inferArea } from "../src/lib/platform/areaClassifier";
import { parseHeadline } from "../src/lib/enrichment/headline";
import { extractSkills } from "../src/lib/matching/vocabulary";
import type { ReferralStatus } from "../src/lib/platform/types";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória");
if (!process.env.APP_SECRET) throw new Error("APP_SECRET é obrigatória (o convite é assinado com ela)");
if (process.env.SEED_CONFIRM !== "yes") throw new Error("Rode com SEED_CONFIRM=yes para confirmar a escrita no banco apontado por DATABASE_URL");

const SPOTLIGHT = (process.env.SEED_SPOTLIGHT ?? "Bruno Azambuja,Guilherme Ferreira Ávila")
  .split(",").map(name => name.trim()).filter(Boolean);

const JOBS = [
  { title: "Engenheiro de Software Sênior", company: "Dream Team", location: "São Paulo",
    description: "Evoluir a plataforma de indicações. Requisitos: Node, TypeScript, PostgreSQL, AWS. Nice to have: Docker, Kubernetes." },
  { title: "Engenheira de Dados Pleno", company: "Dream Team", location: "Remoto",
    description: "Construir o pipeline analítico do produto. Requisitos: Python, SQL, Airflow, dbt. Nice to have: BigQuery, Spark." },
  { title: "Product Manager", company: "Dream Team", location: "São Paulo",
    description: "Conduzir discovery e roadmap da área de indicações. Requisitos: discovery, roadmap, OKR, analytics. Nice to have: Figma." },
  { title: "Product Designer Sênior", company: "Dream Team", location: "Remoto",
    description: "Desenhar os fluxos de convite e indicação. Requisitos: Figma, design system, user research, prototipação. Nice to have: wireframe." },
  { title: "Analista de Growth", company: "Dream Team", location: "São Paulo",
    description: "Aquisição e ativação de novos times. Requisitos: SEO, Google Ads, Meta Ads, performance. Nice to have: email marketing." },
  { title: "Executivo de Vendas B2B", company: "Dream Team", location: "São Paulo",
    description: "Vender para RHs de empresas de tecnologia. Requisitos: CRM, outbound, prospecção, negociação. Nice to have: Salesforce." },
  { title: "Analista Financeiro Sênior", company: "Dream Team", location: "São Paulo",
    description: "Planejamento financeiro e fechamento mensal. Requisitos: FP&A, controladoria, IFRS, orçamento. Nice to have: SAP, Power BI." },
  { title: "Analista de Recrutamento", company: "Dream Team", location: "Remoto",
    description: "Conduzir processos técnicos de ponta a ponta. Requisitos: recrutamento, employer branding, onboarding. Nice to have: people analytics." },
  { title: "Advogado Corporativo", company: "Dream Team", location: "São Paulo",
    description: "Suporte jurídico a contratos e privacidade. Requisitos: contratos, LGPD, compliance, societário. Nice to have: due diligence." },
  { title: "Coordenador de Operações", company: "Dream Team", location: "Campinas",
    description: "Coordenar a operação de atendimento e processos internos. Requisitos: Excel, Power BI, supply chain. Nice to have: logística." },
];

const FUNNEL: ReferralStatus[] = ["submitted", "reviewing", "contacted", "hired", "declined"];

type AdminContact = { id: string; name: string; headline: string | null; linkedinUrl: string | null; phone: string | null };

const withoutAccents = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

function emailFor(name: string): string {
  return `${withoutAccents(name).replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@demo.local`;
}

/** Só o cargo: headline vem com empresa e stack colados ("PM na Loft | Discovery, OKR"). */
function cleanRole(role: string | null): string | null {
  if (!role) return null;
  const withoutStack = role.split(/[|•·]|\s[–—-]\s/)[0];
  const withoutCompany = withoutStack.split(/\s+(?:na|no|at|@)\s+/i)[0];
  return withoutCompany.replace(/\s{2,}/g, " ").trim() || null;
}

/** Vaga desenhada a partir do perfil real da pessoa, para ela necessariamente casar. */
function jobForContact(contact: AdminContact) {
  const parsed = parseHeadline(contact.headline);
  const area = inferArea({ headline: contact.headline, profileContext: null }).area;
  const role = cleanRole(parsed.role)?.slice(0, 110);
  const skills = extractSkills(contact.headline ?? "");
  const title = role && role.length >= 4 ? role : `Especialista em ${areaLabel(area) ?? "Operações"}`;
  const requirements = skills.length ? skills.slice(0, 5).join(", ") : (areaLabel(area) ?? "atuação generalista");
  return {
    title,
    company: "Dream Team",
    location: "Remoto",
    description: `Posição aberta para reforçar o time de ${areaLabel(area) ?? "Operações"}. Requisitos: ${requirements}. Buscamos alguém com trajetória compatível com o perfil de ${role ?? "referência"} e disponibilidade para começar no próximo trimestre.`,
  };
}

async function main() {
  // 1. De quem é a rede: o administrador com mais contatos.
  const owners = await query<{ administratorId: string; name: string; total: number }>(
    `SELECT c.administrator_id AS "administratorId", a.name, count(*)::int AS total
     FROM admin_network_contacts c JOIN administrators a ON a.id=c.administrator_id
     GROUP BY c.administrator_id, a.name ORDER BY total DESC LIMIT 1`);
  const owner = owners[0];
  if (!owner) throw new Error("Nenhum contato na rede do admin. Rode o conector do LinkedIn antes: este seed não inventa pessoas.");

  const contacts = await query<AdminContact>(
    `SELECT id, name, headline, linkedin_url AS "linkedinUrl", phone FROM admin_network_contacts
     WHERE administrator_id=$1 ORDER BY network_capital_score DESC, created_at`, [owner.administratorId]);
  const withUrl = contacts.filter(contact => contact.linkedinUrl);
  console.log(`Rede de ${owner.name}: ${contacts.length} contatos (${withUrl.length} com URL, ${contacts.filter(c => c.phone).length} com telefone).`);
  if (withUrl.length < 6) throw new Error("Menos de 6 contatos com URL de LinkedIn: sem base para distribuir entre membros.");

  // 2. Quem tem de aparecer nas indicações, e a vaga sob medida de cada um.
  const spotlight = SPOTLIGHT.map(name => {
    const needle = withoutAccents(name);
    const found = withUrl.find(contact => withoutAccents(contact.name) === needle)
      ?? withUrl.find(contact => withoutAccents(contact.name).includes(needle))
      ?? withUrl.find(contact => needle.split(" ").every(part => withoutAccents(contact.name).includes(part)));
    if (!found) console.warn(`  ! "${name}" não foi encontrado na rede com URL de LinkedIn — será ignorado.`);
    return found ? { requested: name, contact: found, job: jobForContact(found) } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  for (const entry of spotlight) console.log(`  destaque: ${entry.contact.name} -> vaga "${entry.job.title}"`);

  // 3. Vagas: as dez fixas mais uma por pessoa em destaque.
  const wanted = [...JOBS, ...spotlight.map(entry => entry.job)]
    .filter((job, index, all) => all.findIndex(other => other.title.toLowerCase() === job.title.toLowerCase()) === index);
  const existing = new Map((await listJobs()).map(job => [job.title.toLowerCase(), job.id]));
  const jobIds: Array<{ id: string; title: string; created: boolean }> = [];
  for (const job of wanted) {
    const already = existing.get(job.title.toLowerCase());
    if (already) { jobIds.push({ id: already, title: job.title, created: false }); continue; }
    jobIds.push({ id: await createJob({ ...job, status: "open" }), title: job.title, created: true });
  }
  const jobIdByTitle = new Map(jobIds.map(job => [job.title.toLowerCase(), job.id]));
  console.log(`Vagas: ${jobIds.filter(job => job.created).length} criadas, ${jobIds.filter(job => !job.created).length} reaproveitadas.`);

  // 4. Ranking determinístico de cada vaga (alimenta as duas abas do admin).
  for (const job of jobIds) await seedJobRecommendations(job.id);

  // 5. Membros: os três contatos de maior capital de rede viram time.
  const memberSeeds = withUrl.filter(contact => !spotlight.some(entry => entry.contact.id === contact.id)).slice(0, 3);
  const members: Array<{ id: string; name: string }> = [];
  for (const seed of memberSeeds) {
    const email = emailFor(seed.name);
    const found = await query<{ id: string }>(`SELECT id FROM members WHERE email=$1`, [email]);
    if (found[0]) { members.push({ id: found[0].id, name: seed.name }); continue; }
    const invitation = await createInvitation(email);
    const accepted = await acceptInvitation(invitation.token, { name: seed.name, email });
    members.push({ id: accepted.memberId, name: seed.name });
  }
  if (!members.length) throw new Error("Não foi possível criar nenhum membro.");
  console.log(`Membros: ${members.map(member => member.name).join(", ")}`);

  // 6. Rede de cada membro: fatia da rede do admin, com sobreposição proposital (contato
  //    alcançável por mais de um caminho) e os destaques em todas as redes.
  const pool = withUrl.filter(contact => !memberSeeds.some(seed => seed.id === contact.id));
  for (const [index, member] of members.entries()) {
    const slice = pool.filter((_, position) => position % members.length === index);
    const network = [...new Map([...slice, ...pool.slice(0, 3), ...spotlight.map(entry => entry.contact)]
      .map(contact => [contact.linkedinUrl!, contact])).values()];
    await upsertNetworkContacts(member.id, network.map(contact => ({ name: contact.name, headline: contact.headline, profileUrl: contact.linkedinUrl! })));
    console.log(`  ${member.name}: ${network.length} conexões`);
  }

  // 7. Indicações dos destaques primeiro: cada um na sua vaga sob medida.
  let referralsCreated = 0;
  const spotlightPairs: Array<{ jobId: string; linkedinUrl: string }> = [];
  for (const entry of spotlight) {
    const jobId = jobIdByTitle.get(entry.job.title.toLowerCase());
    if (!jobId) continue;
    for (const member of members) {
      try {
        await submitReferral(member.id, {
          jobId,
          candidateName: entry.contact.name,
          linkedinUrl: entry.contact.linkedinUrl,
          relationshipNote: `Conheço o trabalho de ${entry.contact.name.split(" ")[0]} e o perfil casa com a vaga. Indicação de ${member.name}.`,
        });
        referralsCreated += 1;
        spotlightPairs.push({ jobId, linkedinUrl: entry.contact.linkedinUrl! });
        console.log(`  indicado: ${entry.contact.name} para "${entry.job.title}" por ${member.name}`);
        break;
      } catch { /* tenta o próximo membro: só quem tem o contato na rede consegue indicar. */ }
    }
  }

  // 8. Indicações do resto: cada membro indica os melhores candidatos das vagas mais aderentes.
  for (const member of members) {
    const opportunities = (await listRankedOpportunities(member.id)).filter(item => item.candidates.length).slice(0, 4);
    for (const opportunity of opportunities) {
      for (const candidate of opportunity.candidates.slice(0, 2)) {
        if (!candidate.linkedinUrl || !candidate.name) continue;
        try {
          await submitReferral(member.id, {
            jobId: opportunity.job.id,
            candidateName: candidate.name,
            linkedinUrl: candidate.linkedinUrl,
            relationshipNote: `Trabalhamos juntos e conheço o histórico. Indicação de ${member.name}.`,
          });
          referralsCreated += 1;
        } catch { /* candidato fora da rede do membro ou vaga fechada. */ }
      }
    }
  }
  // "registradas" e não "criadas": submitReferral faz upsert, então numa segunda execução
  // o número se repete sem duplicar nada no banco.
  console.log(`Indicações registradas: ${referralsCreated}`);

  // 9. Espalha as indicações pelo funil, para o painel não ficar todo em "submitted".
  //    As dos destaques ficam propositalmente nos estágios de avanço.
  const referrals = await query<{ id: string; jobId: string; linkedinUrl: string | null }>(
    `SELECT id, job_id AS "jobId", linkedin_url AS "linkedinUrl" FROM referrals ORDER BY created_at`);
  // Só a indicação do destaque na vaga sob medida vai para "contacted"; o resto percorre o funil,
  // senão o painel fica com quase tudo no mesmo estágio.
  const highlighted = new Set(spotlightPairs.map(pair => `${pair.jobId}|${pair.linkedinUrl}`));
  let cursor = 0;
  for (const referral of referrals) {
    if (highlighted.has(`${referral.jobId}|${referral.linkedinUrl}`)) {
      await updateReferralStatus(referral.id, "contacted");
      continue;
    }
    const status = FUNNEL[cursor % FUNNEL.length];
    cursor += 1;
    if (status !== "submitted") await updateReferralStatus(referral.id, status);
  }

  // 10. Outreach preparado para as recomendações que têm telefone.
  let outreachCreated = 0;
  const phoneByContact = new Map(contacts.filter(contact => contact.phone).map(contact => [contact.id, contact.phone!]));
  for (const job of jobIds.slice(0, 5)) {
    const recommendations = (await listJobRecommendations(job.id)).filter(item => phoneByContact.has(item.contactId)).slice(0, 3);
    if (!recommendations.length) continue;
    try {
      await createOutreachRequests(owner.administratorId, job.id, recommendations.map(item => ({
        recommendationId: item.id,
        phone: phoneByContact.get(item.contactId)!,
        kind: item.kind,
        message: `Oi! Estamos com uma vaga de ${job.title} e seu perfil me lembrou dela. Posso te mandar os detalhes?`,
      })));
      outreachCreated += recommendations.length;
    } catch { /* outreach já preparado para essa recomendação. */ }
  }
  console.log(`Mensagens de outreach preparadas: ${outreachCreated}`);

  console.log("\nRecomendações por vaga:");
  for (const job of jobIds) {
    const all = await listJobRecommendations(job.id);
    console.log(`  ${job.title.slice(0, 34).padEnd(34)} candidatos ${String(all.filter(i => i.kind === "candidate_fit").length).padStart(3)} | indicadores ${String(all.filter(i => i.kind === "connector_fit").length).padStart(3)}`);
  }

  const funnel = await query<{ status: string; total: number }>(`SELECT status, count(*)::int AS total FROM referrals GROUP BY status ORDER BY status`);
  console.log("\nFunil de indicações:", funnel.map(row => `${row.status}=${row.total}`).join(" · ") || "(vazio)");
}

await main();
process.exit(0);
