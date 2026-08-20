import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPublicProfile } from "./publicProfile";

const originalKey=process.env.OPENROUTER_API_KEY;
afterEach(()=>{process.env.OPENROUTER_API_KEY=originalKey;vi.restoreAllMocks();});

describe("public professional discovery",()=>{
  it("confirms only an identity with two anchors and a cited public source",async()=>{
    process.env.OPENROUTER_API_KEY="test-key";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({model:"test",choices:[{message:{content:"Public research",annotations:[{type:"url_citation",url_citation:{url:"https://example.com/profile",title:"Public profile",content:"Engineer at Example"}}]}}],usage:{prompt_tokens:10,completion_tokens:5}}),{status:200,headers:{"Content-Type":"application/json"}})).mockResolvedValueOnce(new Response(JSON.stringify({model:"test",choices:[{message:{content:JSON.stringify({match:true,identityConfidence:.91,matchedAnchors:["exact_name","current_company"],headline:"Engineer at Example",education:["USP"],experience:["Example"],internationalExperience:[],summary:"Public professional profile"})}}],usage:{prompt_tokens:8,completion_tokens:4}}),{status:200,headers:{"Content-Type":"application/json"}})));
    const result=await discoverPublicProfile({name:"Pessoa Exemplo",headline:"Engineer at Example",linkedinUrl:null});
    expect(result.confirmed).toBe(true);
    expect(result.sources[0].url).toBe("https://example.com/profile");
    expect(fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions",expect.objectContaining({method:"POST"}));
    const searchBody=JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    const structureBody=JSON.parse(String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body));
    expect(searchBody.tools).toEqual([{type:"openrouter:web_search"}]);
    expect(searchBody.provider).toEqual({zdr:true,data_collection:"deny"});
    expect(structureBody.response_format.type).toBe("json_schema");
  });

  it("rejects confident-looking output without independent identity anchors",async()=>{
    process.env.OPENROUTER_API_KEY="test-key";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:"Research",annotations:[{type:"url_citation",url_citation:{url:"https://example.com",title:"Result"}}]}}]}),{status:200,headers:{"Content-Type":"application/json"}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({match:true,identityConfidence:.99,matchedAnchors:["exact_name"],headline:null,education:[],experience:[],internationalExperience:[],summary:null})}}]}),{status:200,headers:{"Content-Type":"application/json"}})));
    const result=await discoverPublicProfile({name:"Nome Comum",headline:null,linkedinUrl:null});
    expect(result.confirmed).toBe(false);
  });
});
