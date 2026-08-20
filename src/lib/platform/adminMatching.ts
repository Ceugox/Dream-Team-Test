import { createPerson } from "../domain/person";
import { computeCandidateFit } from "../matching/candidateFit";
import { parseJobDescription } from "../matching/jobParser";
import { parseHeadline } from "../enrichment/headline";
import type { AdminNetworkContact, Job, RecommendationKind } from "./types";
import { scoreConnectorFit } from "./adminNetwork";

export type AdminRecommendationDraft = { contactId:string; administratorId:string; kind:RecommendationKind; score:number; confidence:number; evidence:string[] };

export function buildAdminRecommendations(job: Job, contacts: AdminNetworkContact[]): AdminRecommendationDraft[] {
  const profile=parseJobDescription(`${job.title} - ${job.company} - ${job.location??"Remoto"}\n${job.description}`,job.title);
  const drafts:AdminRecommendationDraft[]=[];
  for (const contact of contacts) {
    const parsed=parseHeadline(contact.headline);
    const person=createPerson({id:contact.id,name:contact.name,headline:contact.headline,linkedinUrl:contact.linkedinUrl,currentRole:parsed.role,currentCompany:parsed.company,sources:[contact.source]});
    const candidate=computeCandidateFit(person,profile);
    if (candidate.score>=.14) {
      const evidence:string[]=[];
      if(candidate.roleFit>0)evidence.push("Cargo relacionado ao núcleo da vaga");
      if(candidate.skillsFit>0)evidence.push("Competências aderentes à descrição");
      if(candidate.seniorityFit>=.7)evidence.push("Senioridade compatível");
      drafts.push({contactId:contact.id,administratorId:contact.administratorId,kind:"candidate_fit",score:candidate.score,confidence:contact.headline?.trim()?.length?0.78:0.42,evidence:evidence.length?evidence:["Perfil profissional parcialmente aderente"]});
    }
    const connector=scoreConnectorFit(contact,profile);
    if(connector.score>=.35) drafts.push({contactId:contact.id,administratorId:contact.administratorId,kind:"connector_fit",score:connector.score,confidence:0.68,evidence:connector.evidence});
  }
  return drafts.sort((a,b)=>b.score-a.score);
}
