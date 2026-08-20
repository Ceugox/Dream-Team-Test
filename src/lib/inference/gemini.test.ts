import { afterEach,describe,expect,it,vi } from "vitest";
import { z } from "zod";
import { inferStructuredGemini } from "./gemini";

afterEach(()=>{delete process.env.GEMINI_API_KEY;delete process.env.GEMINI_MODEL;vi.unstubAllGlobals();});

describe("Gemini inference",()=>{
  it("validates structured output and keeps the key in a header",async()=>{
    process.env.GEMINI_API_KEY="private-test-key";process.env.GEMINI_MODEL="gemini-test";
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({modelVersion:"gemini-test-001",candidates:[{content:{parts:[{text:'{"answer":"ok"}'}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:3}}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await inferStructuredGemini({schema:{type:"object",properties:{answer:{type:"string"}},required:["answer"]},validator:z.object({answer:z.string()}),system:"Return JSON",payload:{task:"test"}});
    const [url,options]=fetchMock.mock.calls[0];const body=JSON.parse(String(options?.body));
    expect(String(url)).toContain("gemini-test:generateContent");
    expect(options?.headers).toMatchObject({"x-goog-api-key":"private-test-key"});
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(result.data.answer).toBe("ok");
    expect(result.usage).toEqual({promptTokens:12,completionTokens:3});
  });
});
