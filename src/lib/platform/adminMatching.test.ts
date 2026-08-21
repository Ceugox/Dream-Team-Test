import { describe, expect, it } from "vitest";
import { buildAdminRecommendations } from "./adminMatching";
import type { AdminNetworkContact, Job } from "./types";

const job:Job={id:"job",title:"Staff Backend Engineer",company:"Nubank",location:"São Paulo",description:"Required: typescript, aws, distributed systems. Fintech.",status:"open",createdAt:"2026-01-01",referralCount:0};
const base={administratorId:"admin",ownerName:"Marina",linkedinUrl:null,phone:"5511999999999",source:"linkedin",createdAt:"2026-01-01",profileContext:null,networkCapitalScore:0,networkCapitalEvidence:[],networkCapitalConfidence:0,publicEnrichmentStatus:"pending" as const,publicIdentityConfidence:0,publicSources:[],publicEnrichedAt:null,areaOverride:null};

describe("admin matching",()=>{
  it("separates potential candidates and connectors",()=>{
    const contacts:AdminNetworkContact[]=[
      {...base,id:"candidate",name:"Bia",headline:"Staff Backend Engineer | TypeScript AWS | fintech"},
      {...base,id:"connector",name:"Caio",headline:"Head of Talent for fintech engineering"},
    ];
    const result=buildAdminRecommendations(job,contacts);
    expect(result.some(item=>item.contactId==="candidate"&&item.kind==="candidate_fit")).toBe(true);
    expect(result.some(item=>item.contactId==="connector"&&item.kind==="connector_fit")).toBe(true);
  });
});
