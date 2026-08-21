import { describe, expect, it } from "vitest";
import { detectIndustry, detectSeniority, extractSkills } from "./vocabulary";

describe("detectSeniority", () => {
  it("reconhece senioridade acentuada em português", () => {
    // /\bsenior\b/ não casa "Sênior": era por isso que vaga e headline em PT-BR viravam
    // "unknown" e a dimensão de senioridade dava pontuação de graça.
    expect(detectSeniority("Engenheiro de Software Sênior")).toBe("senior");
    expect(detectSeniority("Engenheira de Software Senior")).toBe("senior");
    expect(detectSeniority("Analista Júnior")).toBe("junior");
    expect(detectSeniority("Estagiária de Dados")).toBe("junior");
    expect(detectSeniority("Desenvolvedor Pleno")).toBe("pleno");
  });

  it("trata cargos de liderança como staff", () => {
    expect(detectSeniority("Head of Engineering")).toBe("staff");
    expect(detectSeniority("Head de Produto")).toBe("staff");
    expect(detectSeniority("Diretora Comercial")).toBe("staff");
    expect(detectSeniority("Principal Engineer")).toBe("staff");
  });

  it("devolve unknown sem sinal e sem texto", () => {
    expect(detectSeniority("Backend Engineer at Nubank")).toBe("unknown");
    expect(detectSeniority(null)).toBe("unknown");
    expect(detectSeniority("")).toBe("unknown");
  });
});

describe("extractSkills", () => {
  it("cobre stack além do inglês e além de tecnologia", () => {
    expect(extractSkills("Node, Next.js e Tailwind")).toEqual(expect.arrayContaining(["node", "next.js", "tailwind"]));
    expect(extractSkills("Rotina de controladoria, IFRS e SAP")).toEqual(expect.arrayContaining(["controladoria", "ifrs", "sap"]));
    expect(extractSkills("Recrutamento técnico e employer branding")).toEqual(expect.arrayContaining(["recrutamento", "employer branding"]));
    expect(extractSkills("Figma, design system e user research")).toEqual(expect.arrayContaining(["figma", "design system", "user research"]));
  });

  it("não casa skill por substring", () => {
    expect(extractSkills("JavaScript only")).not.toContain("java");
    expect(extractSkills("Trabalho com Go")).toContain("go");
    expect(extractSkills("Gosto de negociar")).not.toContain("go");
  });

  it("não inventa skill em texto sem stack", () => {
    expect(extractSkills("Profissional dedicado, com foco em resultado.")).toEqual([]);
  });
});

describe("detectIndustry", () => {
  it("reconhece setor em português", () => {
    expect(detectIndustry("Empresa do agronegócio brasileiro")).toBe("agronegócio");
    expect(detectIndustry("Operação de varejo com 300 lojas")).toBe("varejo");
    expect(detectIndustry("Corretora de seguros digital")).toBe("seguros");
  });

  it("devolve null quando não há setor", () => {
    expect(detectIndustry("Vaga para atuar no time interno.")).toBeNull();
  });
});
