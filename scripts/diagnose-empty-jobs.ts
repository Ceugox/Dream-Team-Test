/**
 * Diagnóstico READ-ONLY: por que uma vaga está sem sugestões?
 *
 * Para cada vaga aberta sem linhas em network_recommendations, mostra:
 *  1. o que o parser extraiu do texto (skills, senioridade, setor, área inferida);
 *  2. os maiores scores reais da rede contra ela (candidate e connector), com as
 *     dimensões medidas — evidência direta de "zerou por falta de sinal" vs "falhou algo";
 *  3. o estado dos workflows/tasks da vaga na fila (status, tentativas, último erro).
 *
 * Não escreve nada no banco. Uso:
 *   node scripts/diagnose-empty-jobs-railway.mjs
 */
import { query } from "../src/lib/platform/db";
import { listAdminNetworkContacts } from "../src/lib/platform/repository";
import { CANDIDATE_FIT_THRESHOLD, CONNECTOR_FIT_THRESHOLD } from "../src/lib/platform/adminMatching";
import { scoreConnectorFit } from "../src/lib/platform/adminNetwork";
import { areaLabel, inferArea, inferJobArea } from "../src/lib/platform/areaClassifier";
import { computeCandidateFit } from "../src/lib/matching/candidateFit";
import { parseJobDescription } from "../src/lib/matching/jobParser";
import { parseHeadline } from "../src/lib/enrichment/headline";
import { createPerson } from "../src/lib/domain/person";
import type { Job } from "../src/lib/platform/types";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória");

type JobRow = Job & { recCount: number };

const jobs = await query<JobRow>(`SELECT j.id,j.title,j.company,j.location,j.description,j.status,
    j.created_at::text AS "createdAt",
    (SELECT count(*)::int FROM network_recommendations r WHERE r.job_id=j.id) AS "recCount"
  FROM jobs j ORDER BY j.created_at DESC`);

console.log(`\n=== Vagas (${jobs.length}) ===`);
for (const job of jobs) console.log(`  [${job.status}] ${job.createdAt} ${job.title} — ${job.recCount} recomendação(ões)  (${job.id})`);

const empty = jobs.filter(job => job.status === "open" && job.recCount === 0);
if (!empty.length) {
  console.log("\nNenhuma vaga aberta sem recomendações. Nada a diagnosticar.");
  process.exit(0);
}

const contacts = await listAdminNetworkContacts();
console.log(`\nRede coletiva: ${contacts.length} contato(s)`);

for (const job of empty) {
  console.log(`\n=== ${job.title} (${job.id}) ===`);

  // 1. O que o parser enxerga na vaga
  const profile = parseJobDescription(`${job.title} - ${job.company} - ${job.location ?? "Remoto"}\n${job.description}`, job.title);
  const jobArea = inferJobArea(profile);
  console.log(`  Parser: skills=[${profile.requiredSkills.join(", ") || "NENHUMA"}]` +
    ` preferidas=[${profile.preferredSkills.join(", ") || "-"}]` +
    ` senioridade=${profile.seniority} setor=${profile.industry ?? "-"}` +
    ` área=${jobArea ? (areaLabel(jobArea) ?? jobArea) : "NÃO INFERIDA"}`);

  // 2. Top scores reais da rede (inclusive abaixo do limiar — é o ponto do diagnóstico)
  const scored = contacts.map(contact => {
    const parsed = parseHeadline(contact.headline);
    const person = createPerson({ id: contact.id, name: contact.name, headline: contact.headline,
      linkedinUrl: contact.linkedinUrl, currentRole: parsed.role, currentCompany: parsed.company, sources: [contact.source] });
    const contactArea = contact.areaOverride ?? inferArea({ headline: contact.headline, profileContext: contact.profileContext ?? null }).area;
    const sameArea = jobArea && contactArea ? jobArea === contactArea : null;
    const candidate = computeCandidateFit(person, profile, { sameArea });
    const connector = scoreConnectorFit(contact, profile);
    return { name: contact.name, headline: contact.headline, candidate, connector };
  });

  const topCandidates = [...scored].sort((a, b) => b.candidate.score - a.candidate.score).slice(0, 5);
  console.log(`  Top candidate_fit (limiar ${CANDIDATE_FIT_THRESHOLD}):`);
  for (const item of topCandidates) {
    const fit = item.candidate;
    console.log(`    ${fit.score.toFixed(3)} ${fit.score >= CANDIDATE_FIT_THRESHOLD ? "✅" : "❌"} ${item.name}` +
      ` — medidas=[${fit.measured.join(",") || "nenhuma"}] skills=${fit.skillsFit.toFixed(2)}` +
      ` role=${fit.roleFit.toFixed(2)} área=${fit.areaFit.toFixed(2)} | ${item.headline ?? "(sem headline)"}`);
  }
  const topConnectors = [...scored].sort((a, b) => b.connector.score - a.connector.score).slice(0, 3);
  console.log(`  Top connector_fit (limiar ${CONNECTOR_FIT_THRESHOLD}):`);
  for (const item of topConnectors)
    console.log(`    ${item.connector.score.toFixed(3)} ${item.connector.score >= CONNECTOR_FIT_THRESHOLD ? "✅" : "❌"} ${item.name}`);

  // 3. O que a fila fez com a vaga
  const tasks = await query<{ workflowStatus: string; taskType: string; taskStatus: string; attempts: number; lastError: string | null }>(
    `SELECT w.status AS "workflowStatus", t.task_type AS "taskType", t.status AS "taskStatus",
       t.attempts, t.error AS "lastError"
     FROM orchestration_workflows w LEFT JOIN orchestration_tasks t ON t.workflow_id=w.id
     WHERE w.entity_id=$1 ORDER BY t.created_at`, [job.id]);
  if (!tasks.length) console.log("  Fila: NENHUM workflow para esta vaga");
  for (const task of tasks)
    console.log(`  Fila: workflow=${task.workflowStatus} ${task.taskType ?? "-"}=${task.taskStatus ?? "-"}` +
      ` tentativas=${task.attempts ?? 0}${task.lastError ? ` erro="${task.lastError.slice(0, 160)}"` : ""}`);
}

console.log("\nLeitura: ❌ em todos os tops = a vaga zerou por falta de evidência (parser/limiar), não por falha de fila.");
process.exit(0);
