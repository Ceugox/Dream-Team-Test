import { createPerson } from "../domain/person";
import { computeCandidateFit } from "../matching/candidateFit";
import { parseJobDescription } from "../matching/jobParser";
import { parseHeadline } from "../enrichment/headline";
import type { AdminNetworkContact, Job, RecommendationKind } from "./types";
import { scoreConnectorFit } from "./adminNetwork";
import { areaLabel, inferArea, inferJobArea } from "./areaClassifier";

export type AdminRecommendationDraft = { contactId:string; administratorId:string; kind:RecommendationKind; score:number; confidence:number; evidence:string[]; aiInsight?:string|null; aiConfidence?:number|null; inferenceModel?:string|null };

// Limiar calibrado: com pontuação por evidência (sem crédito grátis para dimensão desconhecida),
// quem não tem nenhum sinal de aderência zera. 0.34 mantém aderência parcial real e corta o resto.
export const CANDIDATE_FIT_THRESHOLD = 0.34;
export const CONNECTOR_FIT_THRESHOLD = 0.35;

// Identidade da pessoa através das redes: o mesmo perfil sincronizado por dois admins vira
// duas linhas de contato (a unique do banco é por admin), então a vaga listava a pessoa em dobro.
// O slug de /in/ é a identidade forte: absorve http/https, www., subdomínio de país
// (br.linkedin.com em perfil aberto pela busca), query string e barra final.
function linkedinKey(url: string): string {
  const clean=url.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/[?#].*$/,"").replace(/\/+$/,"");
  const slug=clean.match(/\/in\/([^/]+)/);
  return slug?`li:${slug[1]}`:`url:${clean.replace(/^[a-z0-9-]+\.(?=linkedin\.com)/,"")}`;
}

/** Compara os critérios em ordem; o primeiro que diferir decide. */
function isBetter(a: readonly number[], b: readonly number[]): boolean {
  for(let i=0;i<a.length;i+=1)if(a[i]!==b[i])return a[i]>b[i];
  return false;
}

function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}

/**
 * Junta as cópias da mesma pessoa vindas de redes diferentes. Duas fases porque as chaves
 * não se conversam sozinhas: quem veio do LinkedIn tem URL e quem veio do Google/manual não,
 * e sem a ponte por nome a mesma pessoa escaparia com uma chave de cada tipo. A ponte só vale
 * quando o nome aponta para um único perfil — nome que bate com dois perfis distintos é
 * homônimo até prova em contrário e cada um fica com sua chave.
 */
export function buildPersonKeyResolver(contacts: AdminNetworkContact[]): (contact: AdminNetworkContact) => string {
  const keysByName=new Map<string,Set<string>>();
  for(const contact of contacts){
    if(!contact.linkedinUrl)continue;
    const name=nameKey(contact.name);if(!name)continue;
    const bucket=keysByName.get(name)??new Set<string>();bucket.add(linkedinKey(contact.linkedinUrl));keysByName.set(name,bucket);
  }
  return contact=>{
    if(contact.linkedinUrl)return linkedinKey(contact.linkedinUrl);
    const name=nameKey(contact.name);
    const bridged=keysByName.get(name);
    return bridged?.size===1?[...bridged][0]:`nome:${name}`;
  };
}

export type BuildRecommendationsOptions = {
  /**
   * Contatos que já têm outreach preparado nesta vaga. Eles vencem a disputa porque
   * `replaceJobRecommendations` se recusa a apagar recomendação com outreach: se o ranking
   * elegesse a outra cópia, a antiga sobreviveria ao lado da nova e a duplicata voltaria
   * justamente para quem já foi abordado.
   */
  pinnedContactIds?: ReadonlySet<string>;
};

export function buildAdminRecommendations(job: Job, contacts: AdminNetworkContact[], options: BuildRecommendationsOptions = {}): AdminRecommendationDraft[] {
  const profile=parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title);
  const jobArea=inferJobArea(profile);
  const pinned=options.pinnedContactIds??new Set<string>();
  const personKey=buildPersonKeyResolver(contacts);
  const drafts:AdminRecommendationDraft[]=[];
  // Critério por (pessoa,kind), nesta ordem: outreach preparado, telefone, score. O telefone vem
  // antes do score porque a ação principal do card é o WhatsApp — ficar com a cópia mais bem
  // pontuada mas sem telefone tira da tela um contato que a rede tinha como acionável.
  const bestByPerson=new Map<string,{index:number;rank:[number,number,number]}>();
  const keep=(draft:AdminRecommendationDraft,contact:AdminNetworkContact)=>{
    const key=`${personKey(contact)}|${draft.kind}`;
    const rank:[number,number,number]=[pinned.has(contact.id)?1:0,contact.phone?1:0,draft.score];
    const current=bestByPerson.get(key);
    if(current&&!isBetter(rank,current.rank))return;
    if(current)drafts[current.index]=draft;else drafts.push(draft);
    bestByPerson.set(key,{index:current?current.index:drafts.length-1,rank});
  };
  for (const contact of contacts) {
    const parsed=parseHeadline(contact.headline);
    const person=createPerson({id:contact.id,name:contact.name,headline:contact.headline,linkedinUrl:contact.linkedinUrl,currentRole:parsed.role,currentCompany:parsed.company,sources:[contact.source]});
    const contactArea=contact.areaOverride??inferArea({headline:contact.headline,profileContext:contact.profileContext??null}).area;
    // null quando não dá para inferir um dos lados: a dimensão sai da conta em vez de contar como 0.
    const sameArea=jobArea&&contactArea?jobArea===contactArea:null;
    const candidate=computeCandidateFit(person,profile,{sameArea});
    if (candidate.score>=CANDIDATE_FIT_THRESHOLD) {
      const evidence:string[]=[];
      if(candidate.skillsFit>0)evidence.push("Competências aderentes à descrição");
      if(candidate.roleFit>0)evidence.push("Cargo relacionado ao núcleo da vaga");
      if(candidate.seniorityFit>0)evidence.push("Senioridade compatível");
      if(candidate.areaFit>0&&contactArea)evidence.push(`Mesma área da vaga (${areaLabel(contactArea)??contactArea})`);
      if(candidate.industryFit>0)evidence.push(`Experiência no setor ${profile.industry}`);
      keep({contactId:contact.id,administratorId:contact.administratorId,kind:"candidate_fit",score:candidate.score,
        // A confiança acompanha a cobertura de evidência: pouca informação, pouca confiança.
        confidence:Math.min(.9,.35+candidate.evidenceCoverage*.7),
        evidence:evidence.length?evidence:["Perfil profissional parcialmente aderente"]},contact);
    }
    const connector=scoreConnectorFit(contact,profile);
    if(connector.score>=CONNECTOR_FIT_THRESHOLD) keep({contactId:contact.id,administratorId:contact.administratorId,kind:"connector_fit",score:connector.score,confidence:0.68,evidence:connector.evidence},contact);
  }
  return drafts.sort((a,b)=>b.score-a.score);
}
