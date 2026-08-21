import { z } from "zod";
import type { JobProfile } from "../domain/job";
import { normalizePhone } from "./whatsapp";
import { inferNetworkCapital } from "./networkCapital";
import { areaLabel, inferArea } from "./areaClassifier";

const TextOrList = z.union([z.string().max(4000),z.array(z.string().max(500)).max(30)]);

const ContactSchema = z.object({
  name: z.string().trim().min(2).max(160),
  headline: z.string().trim().max(500).optional().default(""),
  profileUrl: z.string().url().max(1000).optional(),
  linkedinUrl: z.string().url().max(1000).optional(),
  phone: z.string().max(40).optional(),
  profileContext: z.string().trim().max(4000).optional(),
  education: TextOrList.optional(),
  experience: TextOrList.optional(),
  internationalExperience: z.union([z.boolean(),z.string().max(500)]).optional(),
});

export type AdminNetworkInput = { name:string; headline:string|null; linkedinUrl:string|null; phone:string|null; source:string; profileContext:string|null; networkCapitalScore:number; networkCapitalEvidence:string[]; networkCapitalConfidence:number };

function text(value:string|string[]|undefined):string{return Array.isArray(value)?value.join(" · "):value?.trim()??"";}

export function parseAdminNetworkFile(data: unknown): AdminNetworkInput[] {
  const parsed = z.array(ContactSchema).max(10000).parse(data);
  const unique = new Map<string,AdminNetworkInput>();
  for (const item of parsed) {
    const linkedinUrl = item.profileUrl ?? item.linkedinUrl ?? null;
    const key = linkedinUrl?.toLowerCase() ?? `${item.name}|${item.headline}`.toLowerCase();
    const previous=unique.get(key);
    const profileContext=[item.profileContext,text(item.education),text(item.experience),item.internationalExperience===true?"Experiência internacional":typeof item.internationalExperience==="string"?item.internationalExperience:"",previous?.profileContext].filter(Boolean).join(" · ")||item.headline||null;
    const headline=item.headline||previous?.headline||null;
    const capital=inferNetworkCapital({headline,profileContext});
    unique.set(key,{name:item.name,headline,linkedinUrl,phone:item.phone?normalizePhone(item.phone):previous?.phone??null,source:"linkedin",profileContext,networkCapitalScore:capital.score,networkCapitalEvidence:capital.evidence,networkCapitalConfidence:capital.confidence});
  }
  return [...unique.values()];
}

export function scoreConnectorFit(contact: { headline:string|null; profileContext?:string|null; areaOverride?:string|null; networkCapitalScore?:number; networkCapitalEvidence?:string[] }, job: JobProfile): { score:number; evidence:string[] } {
  const text = (contact.headline ?? "").toLowerCase();
  const evidence:string[] = [];
  let score = 0.12;
  if (/recruit|talent|people|rh\b|human resources/.test(text)) { score += .42; evidence.push("Atuação ligada a talentos e recrutamento"); }
  if (/manager|head|director|diretor|lead|founder|partner|vp\b/.test(text)) { score += .25; evidence.push("Posição com potencial alcance profissional"); }
  if (job.industry && text.includes(job.industry.toLowerCase())) { score += .16; evidence.push(`Experiência no setor ${job.industry}`); }
  const roleTerms = job.title.toLowerCase().split(/\s+/).filter(term=>term.length>3);
  if (roleTerms.some(term=>text.includes(term))) { score += .12; evidence.push("Proximidade com o núcleo da vaga"); }
  const contactAreaCode=contact.areaOverride??inferArea({headline:contact.headline,profileContext:contact.profileContext??null}).area;
  if(contactAreaCode){
    const jobArea=inferArea({headline:job.title,profileContext:[job.description,job.requiredSkills.join(" "),job.preferredSkills.join(" ")].filter(Boolean).join(" · ")});
    if(jobArea.area===contactAreaCode){score+=.18;evidence.push(`Mesma área da vaga (${areaLabel(contactAreaCode)})`);}
  }
  const capital=contact.networkCapitalScore??inferNetworkCapital({headline:contact.headline,profileContext:contact.profileContext??null}).score;
  if(capital>0){score+=Math.min(.32,capital*.32);evidence.push(...(contact.networkCapitalEvidence??inferNetworkCapital({headline:contact.headline,profileContext:contact.profileContext??null}).evidence));}
  return {score:Math.min(1,score),evidence};
}
