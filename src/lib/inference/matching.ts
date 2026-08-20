import { z } from "zod";
import type { Job, JobIntelligence, RecommendationKind } from "@/lib/platform/types";
import { inferStructured, type StructuredInference } from "./openrouter";

const JobIntelligenceSchema = z.object({
  summary: z.string().min(1).max(600),
  coreSkills: z.array(z.string().min(1).max(80)).max(15),
  adjacentRoles: z.array(z.string().min(1).max(120)).max(12),
  industries: z.array(z.string().min(1).max(80)).max(8),
  seniority: z.string().min(1).max(80),
  missingInformation: z.array(z.string().min(1).max(180)).max(8),
});

const MatchSchema = z.object({
  matches: z.array(z.object({
    id: z.string(),
    kind: z.enum(["candidate_fit", "connector_fit"]),
    score: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    insight: z.string().min(1).max(500),
    evidence: z.array(z.string().min(1).max(180)).min(1).max(5),
    missingInformation: z.array(z.string().min(1).max(180)).max(5),
  })).max(30),
});

const jobJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" }, coreSkills: { type: "array", items: { type: "string" } },
    adjacentRoles: { type: "array", items: { type: "string" } }, industries: { type: "array", items: { type: "string" } },
    seniority: { type: "string" }, missingInformation: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "coreSkills", "adjacentRoles", "industries", "seniority", "missingInformation"],
};

const matchJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { matches: { type: "array", items: { type: "object", additionalProperties: false, properties: {
    id: { type: "string" }, kind: { type: "string", enum: ["candidate_fit", "connector_fit"] },
    score: { type: "number", minimum: 0, maximum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 },
    insight: { type: "string" }, evidence: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
  }, required: ["id", "kind", "score", "confidence", "insight", "evidence", "missingInformation"] } } },
  required: ["matches"],
};

export async function inferJobIntelligence(job: Job): Promise<StructuredInference<JobIntelligence>> {
  return inferStructured({
    schemaName: "job_intelligence",
    schema: jobJsonSchema,
    validator: JobIntelligenceSchema,
    system: "Você analisa vagas para matching profissional. Extraia somente o que é sustentado pelo texto, diferencie requisitos de lacunas e responda em português. Não invente informações.",
    payload: { title: job.title, company: job.company, location: job.location, description: job.description },
    maxTokens: 900,
  });
}

export type InferenceMatchInput = {
  id: string; kind: RecommendationKind; headline: string | null; professionalContext?:string|null; networkCapitalEvidence?:string[]; baseScore: number; deterministicEvidence: string[];
};
export type InferenceMatch = z.infer<typeof MatchSchema>["matches"][number];

export async function inferMatchRanking(job: Job, intelligence: JobIntelligence, matches: InferenceMatchInput[]): Promise<StructuredInference<InferenceMatch[]>> {
  const aliases = new Map(matches.map((match, index) => [`p${index + 1}`, match]));
  const reverse = new Map(Array.from(aliases, ([alias, match]) => [match.id + match.kind, alias]));
  const result = await inferStructured({
    schemaName: "match_ranking",
    schema: matchJsonSchema,
    validator: MatchSchema.transform(value => value.matches),
    system: "Você reranqueia perfis profissionais para uma vaga. Receberá apenas identificadores opacos e contexto profissional, sem nomes ou contatos. Não presuma competências sem evidência: reduza a confiança e liste o dado faltante. Formação, empresas reconhecidas e experiência internacional podem elevar somente connector_fit como sinais de alcance da rede; nunca trate pedigree como prova de competência ou use esses sinais para elevar candidate_fit. Candidate_fit mede aderência direta; connector_fit mede probabilidade de conhecer alguém adequado. Responda em português.",
    payload: {
      job: { title: job.title, location: job.location, intelligence },
      profiles: matches.map(match => ({
        id: reverse.get(match.id + match.kind), kind: match.kind, headline: match.headline,professionalContext:match.professionalContext,networkCapitalEvidence:match.networkCapitalEvidence,
        baseScore: match.baseScore, deterministicEvidence: match.deterministicEvidence,
      })),
    },
    maxTokens: 1800,
  });
  return {
    ...result,
    data: result.data.flatMap(item => {
      const original = aliases.get(item.id);
      if (!original || original.kind !== item.kind) return [];
      return [{ ...item, id: original.id }];
    }),
  };
}
