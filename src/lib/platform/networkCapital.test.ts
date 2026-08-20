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
});
