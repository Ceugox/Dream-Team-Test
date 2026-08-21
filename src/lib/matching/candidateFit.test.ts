import { expect, test } from "vitest";
import { createPerson } from "../domain/person";
import { JobProfileSchema } from "../domain/job";
import { computeCandidateFit } from "./candidateFit";

const job = JobProfileSchema.parse({
  title: "Senior Backend Engineer",
  description: "...",
  requiredSkills: ["python", "aws"],
  preferredSkills: ["kotlin"],
  seniority: "senior",
  location: "Sao Paulo",
  industry: "fintech",
});

test("strong match scores high across all sub-dimensions", () => {
  const person = createPerson({
    id: "1",
    name: "Bruno Carvalho",
    headline: "Senior Backend Engineer, Python, Fintech at Nubank",
    currentRole: "Senior Backend Engineer",
    location: "Sao Paulo",
    skills: ["python", "aws", "kotlin"],
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.skillsFit).toBeGreaterThan(0.6);
  expect(fit.seniorityFit).toBe(1);
  expect(fit.locationFit).toBe(1);
  expect(fit.score).toBeGreaterThan(0.6);
});

test("weak match scores low", () => {
  const person = createPerson({
    id: "2",
    name: "Vitoria Prado",
    headline: "Sales Executive at Salesforce",
    skills: ["salesforce", "negotiation"],
    location: "Rio de Janeiro",
  });
  const fit = computeCandidateFit(person, job);
  expect(fit.score).toBeLessThan(0.4);
});

test("score is the weighted average of the dimensions that actually had evidence", () => {
  const person = createPerson({ id: "3", name: "Test", skills: ["python"], location: "Sao Paulo" });
  const fit = computeCandidateFit(person, job);

  // Sem headline não há cargo, senioridade nem setor do lado da pessoa: essas dimensões saem
  // da conta em vez de valer 0,5 de graça.
  expect(fit.measured).toEqual(["skills", "location"]);
  expect(fit.score).toBeCloseTo((0.35 * fit.skillsFit + 0.1 * fit.locationFit) / 0.45, 5);
  // 0,45 de peso medido sobre 1,30 de peso total (skills .35 + área .30 + cargo .25 + senioridade .15 + setor .15 + local .10).
  expect(fit.evidenceCoverage).toBeCloseTo(0.45 / 1.3, 5);
});

test("dimensão desconhecida não dá pontuação de graça", () => {
  const vagueJob = JobProfileSchema.parse({ title: "Analista", description: "Vaga sem stack, sem setor e sem cidade." });
  const person = createPerson({ id: "5", name: "Alguém", headline: "Analista Financeiro na Delta" });

  // Era este o caso que enchia a aba: indústria e local desconhecidos somavam 0,125 e o
  // limiar era 0,14, então a rede inteira entrava em qualquer vaga.
  const fit = computeCandidateFit(person, vagueJob);
  expect(fit.score).toBe(0);
});

test("senioridade igual, sozinha, não faz de alguém candidato", () => {
  const seniorJob = JobProfileSchema.parse({ title: "Xyz", description: "...", seniority: "senior" });
  const person = createPerson({ id: "6", name: "Sênior de outra praia", headline: "Advogado Sênior na Firma" });

  const fit = computeCandidateFit(person, seniorJob);
  expect(fit.seniorityFit).toBe(1);
  expect(fit.measured).toContain("seniority");
  expect(fit.score).toBe(0);
});

test("alinhamento de área entra na conta quando informado", () => {
  const person = createPerson({ id: "7", name: "Dev", headline: "Backend Engineer, Python at Nubank", currentRole: "Backend Engineer" });

  const aligned = computeCandidateFit(person, job, { sameArea: true });
  const misaligned = computeCandidateFit(person, job, { sameArea: false });
  const unknown = computeCandidateFit(person, job);

  expect(aligned.score).toBeGreaterThan(misaligned.score);
  expect(aligned.measured).toContain("area");
  expect(unknown.measured).not.toContain("area");
});

test("javascript skill does not falsely match a job requiring java (word-boundary, not substring)", () => {
  const javaJob = JobProfileSchema.parse({
    title: "Java Backend Engineer",
    description: "...",
    requiredSkills: ["java"],
    preferredSkills: [],
    seniority: "senior",
  });
  const person = createPerson({
    id: "4",
    name: "Test JS",
    headline: "Senior Frontend Engineer",
    skills: ["javascript"],
  });
  const fit = computeCandidateFit(person, javaJob);
  expect(fit.skillsFit).toBe(0);
});
