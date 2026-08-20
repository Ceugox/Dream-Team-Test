import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inferJobIntelligence, inferMatchRanking } from "./matching";
import type { Job, JobIntelligence } from "@/lib/platform/types";

const job:Job={id:"job",title:"Staff Backend Engineer",company:"Acme",location:"Remoto",description:"Required: Go, AWS.",status:"open",createdAt:"2026-01-01",referralCount:0};

describe("OpenRouter inference",()=>{
  beforeEach(()=>{process.env.OPENROUTER_API_KEY="test-key";process.env.OPENROUTER_MODEL="deepseek/test";});
  afterEach(()=>{delete process.env.OPENROUTER_API_KEY;delete process.env.OPENROUTER_MODEL;vi.unstubAllGlobals();});

  it("validates structured job intelligence",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({model:"deepseek/test",choices:[{message:{content:JSON.stringify({summary:"Liderança técnica backend",coreSkills:["Go","AWS"],adjacentRoles:["Principal Engineer"],industries:[],seniority:"Staff",missingInformation:["Faixa salarial"]})}}],usage:{prompt_tokens:100,completion_tokens:40}}),{status:200})));
    const result=await inferJobIntelligence(job);
    expect(result.data.coreSkills).toEqual(["Go","AWS"]);
    expect(result.usage).toEqual({promptTokens:100,completionTokens:40});
  });

  it("sends only pseudonymous profiles and maps aliases back",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:"deepseek/test",choices:[{message:{content:JSON.stringify({matches:[{id:"p1",kind:"candidate_fit",score:.91,confidence:.82,insight:"Experiência diretamente aderente.",evidence:["Go no headline"],missingInformation:[]}]})}}]}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    const intelligence:JobIntelligence={summary:"Backend",coreSkills:["Go"],adjacentRoles:[],industries:[],seniority:"Staff",missingInformation:[]};
    const result=await inferMatchRanking(job,intelligence,[{id:"real-contact-id",kind:"candidate_fit",headline:"Staff Engineer · Go",baseScore:.7,deterministicEvidence:["Cargo relacionado"]}]);
    const body=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(JSON.stringify(body)).not.toContain("real-contact-id");
    expect(body.messages[1].content).not.toContain("phone");
    expect(body.reasoning).toEqual({enabled:false});
    expect(result.data[0].id).toBe("real-contact-id");
  });
});
