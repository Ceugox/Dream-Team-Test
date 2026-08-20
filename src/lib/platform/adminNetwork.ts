import { z } from "zod";
import type { JobProfile } from "../domain/job";
import { normalizePhone } from "./whatsapp";

const ContactSchema = z.object({
  name: z.string().trim().min(2).max(160),
  headline: z.string().trim().max(500).optional().default(""),
  profileUrl: z.string().url().max(1000).optional(),
  linkedinUrl: z.string().url().max(1000).optional(),
  phone: z.string().max(40).optional(),
});

export type AdminNetworkInput = { name:string; headline:string|null; linkedinUrl:string|null; phone:string|null; source:string };

export function parseAdminNetworkFile(data: unknown): AdminNetworkInput[] {
  const parsed = z.array(ContactSchema).max(10000).parse(data);
  const unique = new Map<string,AdminNetworkInput>();
  for (const item of parsed) {
    const linkedinUrl = item.profileUrl ?? item.linkedinUrl ?? null;
    const key = linkedinUrl?.toLowerCase() ?? `${item.name}|${item.headline}`.toLowerCase();
    const previous=unique.get(key);
    unique.set(key,{name:item.name,headline:item.headline||previous?.headline||null,linkedinUrl,phone:item.phone?normalizePhone(item.phone):previous?.phone??null,source:"linkedin"});
  }
  return [...unique.values()];
}

export function scoreConnectorFit(contact: { headline:string|null }, job: JobProfile): { score:number; evidence:string[] } {
  const text = (contact.headline ?? "").toLowerCase();
  const evidence:string[] = [];
  let score = 0.12;
  if (/recruit|talent|people|rh\b|human resources/.test(text)) { score += .42; evidence.push("Atuação ligada a talentos e recrutamento"); }
  if (/manager|head|director|diretor|lead|founder|partner|vp\b/.test(text)) { score += .25; evidence.push("Posição com potencial alcance profissional"); }
  if (job.industry && text.includes(job.industry.toLowerCase())) { score += .16; evidence.push(`Experiência no setor ${job.industry}`); }
  const roleTerms = job.title.toLowerCase().split(/\s+/).filter(term=>term.length>3);
  if (roleTerms.some(term=>text.includes(term))) { score += .12; evidence.push("Proximidade com o núcleo da vaga"); }
  return {score:Math.min(1,score),evidence};
}
