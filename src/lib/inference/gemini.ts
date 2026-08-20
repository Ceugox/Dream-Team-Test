import { z } from "zod";
import type { StructuredInference } from "./openrouter";

export const DEFAULT_GEMINI_MODEL="gemini-3.6-flash";

const GeminiResponseSchema=z.object({
  modelVersion:z.string().optional(),
  candidates:z.array(z.object({content:z.object({parts:z.array(z.object({text:z.string().optional()}))})})).min(1),
  usageMetadata:z.object({promptTokenCount:z.number().optional(),candidatesTokenCount:z.number().optional()}).optional(),
});

export function isGeminiConfigured():boolean{return Boolean(process.env.GEMINI_API_KEY?.trim());}

export async function inferStructuredGemini<T>(input:{schema:Record<string,unknown>;validator:z.ZodType<T>;system:string;payload:unknown;maxTokens?:number}):Promise<StructuredInference<T>>{
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey)throw new Error("GEMINI_NOT_CONFIGURED");
  const model=process.env.GEMINI_MODEL?.trim()||DEFAULT_GEMINI_MODEL;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},signal:controller.signal,
      body:JSON.stringify({systemInstruction:{parts:[{text:input.system}]},contents:[{role:"user",parts:[{text:JSON.stringify(input.payload)}]}],generationConfig:{maxOutputTokens:input.maxTokens??1200,responseMimeType:"application/json",responseJsonSchema:input.schema}}),
    });
    if(!response.ok)throw new Error(`GEMINI_${response.status}`);
    const envelope=GeminiResponseSchema.parse(await response.json());
    const content=envelope.candidates[0].content.parts.map(part=>part.text??"").join("");
    return {data:input.validator.parse(JSON.parse(content)),model:envelope.modelVersion||model,sources:[],usage:{promptTokens:envelope.usageMetadata?.promptTokenCount??0,completionTokens:envelope.usageMetadata?.candidatesTokenCount??0}};
  }finally{clearTimeout(timeout);}
}
