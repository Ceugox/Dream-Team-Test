import { describe, expect, it } from "vitest";
import { pickHeadline } from "./headline.js";

describe("pickHeadline", () => {
  it("extrai a headline entre o nome e o marcador de rodapé (PT)", () => {
    const lines = ["Marcel Saraiva", "Sales & Marketing Executive | Account Executive", "Conexão feita em 20 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Marcel Saraiva")).toBe("Sales & Marketing Executive | Account Executive");
  });

  it("suporta o layout em inglês", () => {
    const lines = ["John Doe", "Software Engineer at Acme", "Connected on Aug 20, 2026", "Message"];
    expect(pickHeadline(lines, "John Doe")).toBe("Software Engineer at Acme");
  });

  it("não confunde sufixos do nome com a headline", () => {
    const lines = ["Gabriel Mendes de Freitas, LLB, MBA", "MBA pela HEC Paris | Inovação", "Conexão feita em 17 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Gabriel Mendes de Freitas, LLB, MBA")).toBe("MBA pela HEC Paris | Inovação");
  });

  it("retorna null quando o card não tem headline", () => {
    const lines = ["Fulano de Tal", "Conexão feita em 14 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Fulano de Tal")).toBeNull();
  });

  it("ignora o próprio nome, o marcador e o botão de ação", () => {
    const lines = ["Mirela Correa", "Mirela Correa", "Venture Capital @ MAYA Capital", "Conexão feita em 13 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Mirela Correa")).toBe("Venture Capital @ MAYA Capital");
  });

  it("trunca headlines muito longas em 500 caracteres", () => {
    const long = "A".repeat(600);
    const lines = ["Diego Santos", long, "Conexão feita em 14 de agosto de 2026", "Mensagem"];
    expect(pickHeadline(lines, "Diego Santos")).toHaveLength(500);
  });
});
