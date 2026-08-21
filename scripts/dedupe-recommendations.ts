/**
 * Remove recomendações duplicadas da mesma pessoa numa vaga.
 *
 * A rede coletiva tem uma linha de contato por admin, então o mesmo perfil sincronizado
 * por dois admins gerava duas recomendações por (vaga, kind). O gerador já deduplica
 * (adminMatching.personKey); este script limpa o que ficou gravado antes do fix.
 *
 * Critério de quem fica, por (organização, vaga, kind, pessoa):
 *   1. quem já tem outreach preparado (nunca é apagado, mesmo como duplicata);
 *   2. maior score; 3. quem tem telefone; 4. id (estável).
 * Identidade da pessoa: linkedin_url normalizada; sem URL, nome minúsculo sem espaços extras.
 *
 * Uso: DATABASE_URL=... node --import tsx scripts/dedupe-recommendations.ts [--audit|--apply]
 * Sem flag é dry-run (lista o que seria removido); --audit checa falsos positivos da chave.
 */
import { query } from "../src/lib/platform/db";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória");
const apply = process.argv.includes("--apply");
const audit = process.argv.includes("--audit");

const keyedCte = `
  keyed AS (
    SELECT r.id, r.organization_id, r.job_id, r.kind, r.score, c.name,
      COALESCE(
        'url:'||regexp_replace(regexp_replace(regexp_replace(lower(c.linkedin_url),'^https?://(www\\.)?',''),'[?#].*$',''),'/+$',''),
        'nome:'||regexp_replace(lower(trim(c.name)),'\\s+',' ','g')
      ) AS person,
      (c.phone IS NOT NULL AND c.phone <> '') AS has_phone,
      EXISTS(SELECT 1 FROM outreach_requests o WHERE o.recommendation_id=r.id) AS has_outreach
    FROM network_recommendations r
    JOIN admin_network_contacts c ON c.id=r.contact_id
  ),
  ranked AS (
    SELECT id, name, job_id, kind, has_outreach, row_number() OVER (
      PARTITION BY organization_id, job_id, kind, person
      ORDER BY has_outreach DESC, score DESC, has_phone DESC, id
    ) AS rn
    FROM keyed
  )`;

if (audit) {
  // Falso positivo = duas linhas de contato distintas colapsadas na mesma chave sem serem
  // a mesma pessoa. O risco real é homônimo sem URL do LinkedIn, então listamos os grupos
  // agrupados por nome cujas headlines divergem — o olho humano decide.
  const grupos = await query<{ person: string; contatos: number; nomes: string[]; headlines: string[] }>(
    `SELECT COALESCE(
        'url:'||regexp_replace(regexp_replace(regexp_replace(lower(c.linkedin_url),'^https?://(www\\.)?',''),'[?#].*$',''),'/+$',''),
        'nome:'||regexp_replace(lower(trim(c.name)),'\\s+',' ','g')
      ) AS person,
      count(DISTINCT c.id)::int AS contatos,
      array_agg(DISTINCT c.name) AS nomes,
      array_agg(DISTINCT COALESCE(c.headline,'(sem headline)')) AS headlines
     FROM admin_network_contacts c
     GROUP BY 1 HAVING count(DISTINCT c.id) > 1`);

  const porUrl = grupos.filter(g => g.person.startsWith("url:"));
  const porNome = grupos.filter(g => g.person.startsWith("nome:"));
  console.log(`Pessoas presentes em mais de uma rede: ${grupos.length} (${porUrl.length} casadas por URL, ${porNome.length} só por nome).`);

  const suspeitos = porNome.filter(g => g.headlines.length > 1);
  if (!suspeitos.length) { console.log("Nenhum grupo casado por nome tem headlines divergentes: sem indício de homônimo."); process.exit(0); }
  console.log(`\n${suspeitos.length} grupo(s) casado(s) só por nome com headlines divergentes (revisar):`);
  for (const g of suspeitos) console.log(`  - ${g.nomes.join(" / ")}\n      ${g.headlines.join("\n      ")}`);
  process.exit(0);
}

const dupes = await query<{ id: string; name: string; jobId: string; kind: string; hasOutreach: boolean }>(
  `WITH ${keyedCte}
   SELECT r.id, r.name, r.job_id AS "jobId", r.kind, r.has_outreach AS "hasOutreach"
   FROM ranked r WHERE r.rn > 1 ORDER BY r.job_id, r.kind, r.name`);

if (!dupes.length) { console.log("Nenhuma recomendação duplicada encontrada."); process.exit(0); }

const preservadas = dupes.filter(d => d.hasOutreach);
const removiveis = dupes.filter(d => !d.hasOutreach);
console.log(`Duplicatas encontradas: ${dupes.length} (${removiveis.length} removíveis, ${preservadas.length} preservadas por terem outreach).`);
for (const d of removiveis) console.log(`  - ${d.name} [${d.kind}] vaga ${d.jobId}`);

if (!apply) { console.log("\nDry-run: nada foi removido. Rode com --apply para efetivar."); process.exit(0); }

await query(
  `WITH ${keyedCte}
   DELETE FROM network_recommendations WHERE id IN (SELECT id FROM ranked WHERE rn > 1 AND NOT has_outreach)`);
console.log(`Removidas ${removiveis.length} recomendações duplicadas.`);
process.exit(0);
