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

export function buildAdminRecommendations(job: Job, contacts: AdminNetworkContact[]): AdminRecommendationDraft[] {
  const profile=parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title);
  const jobArea=inferJobArea(profile);
  const drafts:AdminRecommendationDraft[]=[];
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
      drafts.push({contactId:contact.id,administratorId:contact.administratorId,kind:"candidate_fit",score:candidate.score,
        // A confiança acompanha a cobertura de evidência: pouca informação, pouca confiança.
        confidence:Math.min(.9,.35+candidate.evidenceCoverage*.7),
        evidence:evidence.length?evidence:["Perfil profissional parcialmente aderente"]});
    }
    const connector=scoreConnectorFit(contact,profile);
    if(connector.score>=CONNECTOR_FIT_THRESHOLD) drafts.push({contactId:contact.id,administratorId:contact.administratorId,kind:"connector_fit",score:connector.score,confidence:0.68,evidence:connector.evidence});
  }
  return drafts.sort((a,b)=>b.score-a.score);
}
