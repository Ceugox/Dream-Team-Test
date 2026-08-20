import { z } from "zod";

export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";

type OpenRouterUsage = { promptTokens: number; completionTokens: number };
export type StructuredInference<T> = { data: T; model: string; usage: OpenRouterUsage };

const ResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

export function isInferenceConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export async function inferStructured<T>(input: {
  schemaName: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
  system: string;
  payload: unknown;
  maxTokens?: number;
}): Promise<StructuredInference<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_NOT_CONFIGURED");
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000",
        "X-OpenRouter-Title": "Referral Copilot",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.payload) },
        ],
        temperature: 0.1,
        max_tokens: input.maxTokens ?? 1200,
        reasoning: { enabled: false },
        response_format: { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
    const envelope = ResponseSchema.parse(await response.json());
    const data = input.validator.parse(JSON.parse(envelope.choices[0].message.content));
    return {
      data,
      model: envelope.model || model,
      usage: {
        promptTokens: envelope.usage?.prompt_tokens ?? 0,
        completionTokens: envelope.usage?.completion_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
