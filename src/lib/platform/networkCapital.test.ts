import { describe, expect, it } from "vitest";
import { inferNetworkCapital } from "./networkCapital";

describe("network capital inference",()=>{
  it.each([
    ["Engenheiro formado pelo ITA","A"],
    ["Mestrado na USP","B"],
    ["Universidade Federal de Minas Gerais","C"],
    ["Administração no Insper","D"],
  ])("classifies Brazilian education tiers without penalizing absence",(text,tier)=>{
    const result=inferNetworkCapital({headline:text,profileContext:null});
    expect(result.educationTier).toBe(tier);
    expect(result.score).toBeGreaterThan(0);
  });

  it("treats Harvard or Stanford MBA as a strong explicit signal",()=>{
    const result=inferNetworkCapital({headline:null,profileContext:"MBA at Stanford University"});
    expect(result.score).toBeGreaterThanOrEqual(.9);
    expect(result.evidence.join(" ")).toContain("MBA");
  });

  it.each(["McKinsey & Company","Boston Consulting Group (BCG)","Bain & Company"])("recognizes Big Three consulting: %s",company=>{
    const result=inferNetworkCapital({headline:null,profileContext:`Consultant at ${company}`});
    expect(result.evidence.join(" ")).toContain("Big Three");
  });

  it.each(["BTG Pactual","XP Inc.","Goldman Sachs"])("recognizes selected financial institutions: %s",company=>{
    const result=inferNetworkCapital({headline:null,profileContext:`Experience at ${company}`});
    expect(result.evidence.join(" ")).toContain("mercado financeiro");
  });

  it("adds international exposure only when explicitly stated",()=>{
    expect(inferNetworkCapital({headline:null,profileContext:"Experiência profissional nos Estados Unidos"}).evidence.join(" ")).toContain("internacional");
    expect(inferNetworkCapital({headline:null,profileContext:"Master at University of Toronto"}).evidence).toContain("Formação internacional explicitamente informada");
    expect(inferNetworkCapital({headline:"Software Engineer",profileContext:null})).toMatchObject({score:0,educationTier:null,evidence:[]});
  });

  it("recognizes explicit career progression and leadership signals",()=>{
    const promoted=inferNetworkCapital({headline:null,profileContext:"Promovido a gerente em 2024"});
    expect(promoted.evidence.join(" ")).toContain("Progressão de carreira");
    const leader=inferNetworkCapital({headline:"Director of Partnerships",profileContext:null});
    expect(leader.evidence.join(" ")).toContain("liderança");
    expect(leader.score).toBeGreaterThanOrEqual(.45);
  });

  it("counts a broad declared skill base as supporting evidence only",()=>{
    const broad=inferNetworkCapital({headline:null,profileContext:"Skills: a, b, c, d, e, f"});
    expect(broad.evidence.join(" ")).toContain("skills");
    const narrow=inferNetworkCapital({headline:null,profileContext:"Skills: a, b"});
    expect(narrow.evidence.join(" ")).not.toContain("skills");
  });

  it("labels every inference with the rule version and keeps low confidence for sparse input",()=>{
    const sparse=inferNetworkCapital({headline:"Ex-McKinsey",profileContext:null});
    expect(sparse.ruleVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(sparse.confidence).toBeLessThan(.7);
    expect(sparse.confidence).toBeGreaterThan(0);
    const rich=inferNetworkCapital({headline:"Ex-McKinsey",profileContext:"Consultoria estratégica na McKinsey por 5 anos"});
    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
  });

  it("never phrases evidence as an automatic hiring decision",()=>{
    const result=inferNetworkCapital({headline:"MBA Harvard",profileContext:"ITA · McKinsey · BTG Pactual · Promovido a sócio · Skills: a,b,c,d,e"});
    expect(result.evidence.join(" ").toLowerCase()).not.toMatch(/contratar|contrata[cç][aã]o|aprovado|hire/);
  });
});
