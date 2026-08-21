import { z } from "zod";
import { inferStructured, researchPublicWeb, type PublicSource } from "../inference/openrouter";

const AnchorSchema = z.enum(["exact_name", "current_company", "current_role", "location", "linkedin_url"]);
const PublicProfileSchema = z.object({
  match: z.boolean(),
  identityConfidence: z.number().min(0).max(1),
  matchedAnchors: z.array(AnchorSchema).max(5),
  headline: z.string().max(500).nullable(),
  education: z.array(z.string().max(300)).max(12),
  experience: z.array(z.string().max(300)).max(20),
  internationalExperience: z.array(z.string().max(300)).max(8),
  summary: z.string().max(1500).nullable(),
});

export type PublicProfileDiscovery = z.infer<typeof PublicProfileSchema> & {
  confirmed: boolean;
  sources: PublicSource[];
  model: string;
  usage: { promptTokens: number; completionTokens: number };
};

// Este é o único caminho que manda PII (nome, URL de LinkedIn) para fora. Fica desligado
// por padrão; ligar é decisão consciente de quem opera, com base legal para tratar esses dados.
export function isEnrichmentEnabled(): boolean {
  return process.env.ENRICHMENT_ENABLED?.trim() === "true";
}

export async function discoverPublicProfile(input: {
  name: string;
  headline: string | null;
  linkedinUrl: string | null;
}, signal?: AbortSignal): Promise<PublicProfileDiscovery> {
  if (!isEnrichmentEnabled()) throw new Error("ENRICHMENT_DISABLED");
  const research=await researchPublicWeb({
    signal,
    system:`Você pesquisa perfis profissionais públicos e diferencia homônimos com extremo cuidado. Use apenas fontes abertas. Não procure endereço residencial, documentos, idade, saúde, religião, política, família ou outros dados sensíveis. Relate URLs e deixe explícita qualquer ambiguidade.`,
    payload:{person:input,task:"Localize formação, histórico profissional e experiência internacional verificáveis. Confirme identidade por nome e outro sinal independente."},
    maxTokens:1800,
  });
  const result = await inferStructured({
    signal,
    schemaName: "public_professional_profile",
    validator: PublicProfileSchema,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["match","identityConfidence","matchedAnchors","headline","education","experience","internationalExperience","summary"],
      properties: {
        match: { type: "boolean" },
        identityConfidence: { type: "number", minimum: 0, maximum: 1 },
        matchedAnchors: { type: "array", maxItems: 5, items: { type: "string", enum: ["exact_name","current_company","current_role","location","linkedin_url"] } },
        headline: { type: ["string","null"], maxLength: 500 },
        education: { type: "array", maxItems: 12, items: { type: "string", maxLength: 300 } },
        experience: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
        internationalExperience: { type: "array", maxItems: 8, items: { type: "string", maxLength: 300 } },
        summary: { type: ["string","null"], maxLength: 1500 },
      },
    },
    system: `Você é um pesquisador de perfis profissionais públicos. Pesquise na web e diferencie homônimos com extremo cuidado.
Use apenas informações profissionais publicamente acessíveis. Não procure nem retorne endereço residencial, documentos, idade, saúde, religião, política, família ou outros dados sensíveis.
Só marque match=true quando houver nome exato e ao menos mais um sinal independente coerente (empresa, cargo, localização ou URL de LinkedIn). Não invente fatos. Se houver ambiguidade, retorne match=false. Responda estritamente no JSON solicitado.`,
    payload: { person: input, research:research.content, citedSources:research.sources.map(source=>({url:source.url,title:source.title})), task: "Estruture somente fatos sustentados pela pesquisa e pelas fontes citadas." },
    maxTokens: 1600,
  });
  const anchors = new Set(result.data.matchedAnchors);
  const confirmed = result.data.match && result.data.identityConfidence >= .72 && anchors.has("exact_name") && anchors.size >= 2 && research.sources.length > 0;
  return { ...result.data, confirmed, sources: research.sources, model: result.model, usage: {promptTokens:research.usage.promptTokens+result.usage.promptTokens,completionTokens:research.usage.completionTokens+result.usage.completionTokens} };
}
