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
// duas linhas de contato (a unique do banco é por admin), então a vaga listava a pessoa em
// dobro. URL do LinkedIn normalizada quando existe; sem URL, nome sem acentos/caixa.
function personKey(contact: AdminNetworkContact): string {
  if (contact.linkedinUrl) return `url:${contact.linkedinUrl.toLowerCase().replace(/^https?:\/\/(www\.)?/,"").replace(/[?#].*$/,"").replace(/\/+$/,"")}`;
  return `nome:${contact.name.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim()}`;
}

export function buildAdminRecommendations(job: Job, contacts: AdminNetworkContact[]): AdminRecommendationDraft[] {
  const profile=parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title);
  const jobArea=inferJobArea(profile);
  const drafts:AdminRecommendationDraft[]=[];
  // Por (pessoa,kind) fica a cópia de maior score; empate prefere quem tem telefone (outreach imediato).
  const bestByPerson=new Map<string,{index:number;score:number;hasPhone:boolean}>();
  const keep=(draft:AdminRecommendationDraft,contact:AdminNetworkContact)=>{
    const key=`${personKey(contact)}|${draft.kind}`;
    const current=bestByPerson.get(key);
    const hasPhone=Boolean(contact.phone);
    if(current&&(current.score>draft.score||(current.score===draft.score&&(current.hasPhone||!hasPhone))))return;
    if(current)drafts[current.index]=draft;else drafts.push(draft);
    bestByPerson.set(key,{index:current?current.index:drafts.length-1,score:draft.score,hasPhone});
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
