import { describe, expect, it } from "vitest";
import { inferArea } from "./areaClassifier";

const ctx = (headline: string) => ({ headline, profileContext: null });

describe("inferArea", () => {
  it("classifica cientista/engenheiro de dados como Dados & IA/ML", () => {
    expect(inferArea(ctx("Engenharia Eletrônica (IME) | Estagiário em Data Science | Engenharia de Dados, ELT, AWS Athena, Python, SQL")).area).toBe("dados_ia");
    expect(inferArea(ctx("Generative AI Intern @iFood | Computer Science @CIn UFPE")).area).toBe("dados_ia");
  });

  it("não confunde dev backend (Python/SQL) com Dados", () => {
    expect(inferArea(ctx("Backend Developer | Python | SQL | AWS")).area).toBe("eng_software");
    expect(inferArea(ctx("Full Stack Developer | Java | React | PostgreSQL | AWS")).area).toBe("eng_software");
    expect(inferArea(ctx("Software Engineer na Tivita | Staff Engineer | Tech Lead | Python | C#")).area).toBe("eng_software");
  });

  it("classifica finanças e venture capital como Finanças & Investimentos", () => {
    expect(inferArea(ctx("Venture Capital @ MAYA Capital")).area).toBe("financas");
    expect(inferArea(ctx("Membro da finance da empresa IME Finance")).area).toBe("financas");
    expect(inferArea(ctx("Especialista Financeiro | Operações Financeira | Estratégia Financeira | Modelagem Financeira")).area).toBe("financas");
  });

  it("um perfil de vendas/GTM misto pende para Vendas", () => {
    expect(inferArea(ctx("Sales & Marketing Executive | Account Executive | Product Marketing Manager")).area).toBe("vendas");
  });

  it("consultoria estratégica vence 'MBA' (que sozinho seria Academia)", () => {
    expect(inferArea(ctx("MBA pela HEC Paris | Consultoria Estratégica, Desenvolvimento Corporativo, Gestão e Tomada de Decisão Estratégica")).area).toBe("consultoria");
  });

  it("estudante sem stack cai em Academia & Pesquisa", () => {
    expect(inferArea(ctx("Estudante de Administração | Bolsista de pesquisa")).area).toBe("academia");
  });

  it("retorna null e sem rótulo quando não há sinal de área", () => {
    const result = inferArea(ctx("Presidente"));
    expect(result.area).toBeNull();
    expect(result.label).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("expõe rótulo legível e versão da regra", () => {
    const result = inferArea(ctx("Head of Product | Product Manager"));
    expect(result.area).toBe("produto");
    expect(result.label).toBe("Produto");
    expect(result.matched.length).toBeGreaterThan(0);
    expect(result.ruleVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
