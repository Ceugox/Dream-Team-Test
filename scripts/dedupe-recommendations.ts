/**
 * Remove recomendações duplicadas da mesma pessoa numa vaga.
 *
 * A rede coletiva tem uma linha de contato por admin, então o mesmo perfil sincronizado
 * por dois admins gerava duas recomendações por (vaga, kind). O gerador já deduplica; este
 * script limpa o que ficou gravado antes do fix.
 *
 * A identidade da pessoa vem de `buildPersonKeyResolver`, a mesma função que o gerador usa —
 * reimplementá-la em SQL fazia a limpeza divergir do gerador em acentos, nulos e subdomínio.
 *
 * Critério de quem fica, por (vaga, kind, pessoa): outreach preparado, telefone, score, id.
 * Recomendação com outreach nunca é removida (outreach_requests.recommendation_id é CASCADE).
 *
 * Uso: DATABASE_URL=... node --import tsx scripts/dedupe-recommendations.ts [--audit|--apply]
 * Sem flag é dry-run (lista o que seria removido); --audit checa falsos positivos da chave.
 */
import { query } from "../src/lib/platform/db";
import { listAdminNetworkContacts } from "../src/lib/platform/repository";
import { buildPersonKeyResolver } from "../src/lib/platform/adminMatching";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória");
const apply = process.argv.includes("--apply");
const audit = process.argv.includes("--audit");

const contacts = await listAdminNetworkContacts();
const personKey = buildPersonKeyResolver(contacts);
const byId = new Map(contacts.map(contact => [contact.id, contact]));

if (audit) {
  // Falso positivo = duas linhas de contato distintas colapsadas na mesma chave sem serem a
  // mesma pessoa. Só a chave por nome corre esse risco (URL é identidade forte), e o caso mais
  // arriscado é o contato sem headline nenhuma, onde não sobra nada para confrontar.
  const grupos = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const key = personKey(contact);
    grupos.set(key, [...(grupos.get(key) ?? []), contact]);
  }
  const repetidos = [...grupos.entries()].filter(([, lista]) => lista.length > 1);
  const porUrl = repetidos.filter(([key]) => !key.startsWith("nome:"));
  const porNome = repetidos.filter(([key]) => key.startsWith("nome:"));
  console.log(`Pessoas presentes em mais de uma rede: ${repetidos.length} (${porUrl.length} por URL do LinkedIn, ${porNome.length} só por nome).`);

  // headline nula conta como valor próprio: dois nulos não são prova de que é a mesma pessoa.
  const suspeitos = porNome.filter(([, lista]) => new Set(lista.map(c => c.headline ?? "(sem headline)")).size > 1 || lista.every(c => !c.headline));
  if (!suspeitos.length) { console.log("Nenhum grupo casado por nome é suspeito: sem indício de homônimo."); process.exit(0); }
  console.log(`\n${suspeitos.length} grupo(s) casado(s) só por nome a revisar (headlines divergentes ou ausentes):`);
  for (const [key, lista] of suspeitos) {
    console.log(`  - ${key.replace(/^nome:/, "")}`);
    for (const c of lista) console.log(`      [${c.id}] ${c.headline ?? "(sem headline)"}`);
  }
  process.exit(0);
}

type Row = { id: string; jobId: string; contactId: string; kind: string; score: number; hasOutreach: boolean };
const rows = await query<Row>(`SELECT r.id, r.job_id AS "jobId", r.contact_id AS "contactId", r.kind, r.score,
    EXISTS(SELECT 1 FROM outreach_requests o WHERE o.recommendation_id=r.id) AS "hasOutreach"
  FROM network_recommendations r ORDER BY r.id`);

const rank = (row: Row): [number, number, number] => [row.hasOutreach ? 1 : 0, byId.get(row.contactId)?.phone ? 1 : 0, row.score];
const isBetter = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

const vencedor = new Map<string, Row>();
const perdedores: Row[] = [];
for (const row of rows) {
  const contact = byId.get(row.contactId);
  if (!contact) continue; // recomendação órfã: não é duplicata, fica como está.
  const key = `${row.jobId}|${row.kind}|${personKey(contact)}`;
  const atual = vencedor.get(key);
  if (!atual) { vencedor.set(key, row); continue; }
  if (isBetter(rank(row), rank(atual))) { vencedor.set(key, row); perdedores.push(atual); }
  else perdedores.push(row);
}

const removiveis = perdedores.filter(row => !row.hasOutreach);
const preservadas = perdedores.filter(row => row.hasOutreach);
if (!perdedores.length) { console.log("Nenhuma recomendação duplicada encontrada."); process.exit(0); }

console.log(`Duplicatas encontradas: ${perdedores.length} (${removiveis.length} removíveis, ${preservadas.length} preservadas por terem outreach).`);
for (const row of removiveis) console.log(`  - ${byId.get(row.contactId)?.name ?? row.contactId} [${row.kind}] vaga ${row.jobId}`);

if (!apply) { console.log("\nDry-run: nada foi removido. Rode com --apply para efetivar."); process.exit(0); }

// Apaga por id e conta o que o banco realmente removeu: entre a leitura e o DELETE um
// refreshAdminRecommendations concorrente pode ter mexido nas mesmas linhas.
const apagadas = await query<{ id: string }>(
  `DELETE FROM network_recommendations WHERE id = ANY($1::uuid[])
     AND NOT EXISTS (SELECT 1 FROM outreach_requests o WHERE o.recommendation_id=network_recommendations.id)
   RETURNING id`, [removiveis.map(row => row.id)]);
console.log(`Removidas ${apagadas.length} recomendações duplicadas.`);
process.exit(0);
