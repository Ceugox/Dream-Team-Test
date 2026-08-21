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

  it("não devolve a rede inteira como candidata",()=>{
    // Antes da calibragem, setor e local desconhecidos somavam 0,125 contra um limiar de 0,14:
    // qualquer pessoa entrava em qualquer vaga, inclusive um financeiro numa vaga de backend.
    const contacts:AdminNetworkContact[]=[
      {...base,id:"eng",name:"Bia",headline:"Staff Backend Engineer | TypeScript AWS | fintech"},
      {...base,id:"fin",name:"Diego",headline:"Especialista Financeiro na Delta"},
      {...base,id:"mkt",name:"Zoe",headline:"Estagiária de Marketing na Zeta"},
      {...base,id:"vendas",name:"Ric",headline:"Diretor Comercial na Epsilon"},
    ];

    const candidatos=buildAdminRecommendations(job,contacts).filter(item=>item.kind==="candidate_fit").map(item=>item.contactId);
    expect(candidatos).toEqual(["eng"]);
  });

  it("encontra o candidato certo quando a descrição fala de outra área",()=>{
    // A descrição cita "time de engenharia" e "analytics": inferir a área pela descrição
    // classificava a vaga como Dados & IA e o Product Manager sumia da aba.
    const productJob:Job={...job,title:"Product Manager",description:"Discovery, roadmap e OKR com o time de engenharia. Figma e analytics."};
    const contacts:AdminNetworkContact[]=[
      {...base,id:"pm",name:"Ana",headline:"Product Manager na Gamma"},
      {...base,id:"fin",name:"Diego",headline:"Especialista Financeiro na Delta"},
    ];

    const candidatos=buildAdminRecommendations(productJob,contacts).filter(item=>item.kind==="candidate_fit").map(item=>item.contactId);
    expect(candidatos).toEqual(["pm"]);
  });

  it("não repete a mesma pessoa vinda de redes de admins diferentes",()=>{
    // A vaga ranqueia a rede coletiva: o mesmo perfil sincronizado por dois admins
    // vira duas linhas de contato e aparecia duas vezes na tela da vaga.
    const contacts:AdminNetworkContact[]=[
      {...base,id:"do-marcell",administratorId:"marcell",name:"Bia Souza",headline:"Staff Backend Engineer | TypeScript AWS | fintech",linkedinUrl:"https://www.linkedin.com/in/bia-souza/",phone:null},
      {...base,id:"do-lucas",administratorId:"lucas",name:"Bia Souza",headline:"Staff Backend Engineer | TypeScript AWS | fintech",linkedinUrl:"https://linkedin.com/in/bia-souza",phone:"5511988887777"},
    ];
    const candidatos=buildAdminRecommendations(job,contacts).filter(item=>item.kind==="candidate_fit");
    expect(candidatos).toHaveLength(1);
    // Empate de score: fica a cópia com telefone, que já está pronta para outreach.
    expect(candidatos[0].contactId).toBe("do-lucas");
  });

  it("sem URL do LinkedIn, deduplica pelo nome normalizado",()=>{
    const contacts:AdminNetworkContact[]=[
      {...base,id:"a",administratorId:"marcell",name:"João Câmara",headline:"Staff Backend Engineer | TypeScript AWS | fintech",linkedinUrl:null},
      {...base,id:"b",administratorId:"lucas",name:"joao camara",headline:"Staff Backend Engineer | TypeScript AWS | fintech",linkedinUrl:null},
    ];
    const candidatos=buildAdminRecommendations(job,contacts).filter(item=>item.kind==="candidate_fit");
    expect(candidatos).toHaveLength(1);
  });

  it("confiança acompanha a evidência disponível",()=>{
    const contacts:AdminNetworkContact[]=[{...base,id:"eng",name:"Bia",headline:"Staff Backend Engineer | TypeScript AWS | fintech"}];
    const candidato=buildAdminRecommendations(job,contacts).find(item=>item.kind==="candidate_fit");
    expect(candidato?.confidence).toBeGreaterThan(.35);
    expect(candidato?.confidence).toBeLessThanOrEqual(.9);
  });
});
