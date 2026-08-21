import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integração real: exige um Postgres com o schema aplicado. Sem TEST_DATABASE_URL o bloco é ignorado,
// para o `npm test` padrão seguir rodando sem banco.
const databaseUrl = process.env.TEST_DATABASE_URL;

type Repository = typeof import("./repository");

describe.skipIf(!databaseUrl)("recommendation refresh preserves outreach history", () => {
  let repository: Repository;
  let administratorId: string;
  let jobId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    // O caminho determinístico é o que interessa aqui; a LLM tornaria o teste instável.
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;

    repository = await import("./repository");

    const administrator = await repository.upsertAdministrator({
      name: "Auditoria Outreach",
      email: `outreach-${Date.now()}@test.local`,
    });
    administratorId = administrator.id;

    await repository.addAdminNetworkContact(administratorId, {
      name: "Contato Aderente",
      headline: "Engenheira de Software Sênior na Acme | React, TypeScript, Node",
      phone: "+55 11 99999-0000",
      profileContext: "Trabalhou com plataformas React e TypeScript em escala.",
    });

    jobId = await repository.createJob({
      title: "Engenheira de Software Sênior",
      company: "Dream Team",
      location: "Remoto",
      description: "Buscamos engenharia sênior com React, TypeScript e Node para a plataforma.",
      status: "open",
    });
  });

  afterAll(async () => {
    if (!repository) return;
    // A vaga cascateia recomendações e outreach; o administrador cascateia os contatos dele.
    const { query } = await import("./db");
    await query("DELETE FROM jobs WHERE id=$1", [jobId]);
    await query("DELETE FROM administrators WHERE id=$1", [administratorId]);
  });

  it("keeps prepared outreach when recommendations are refreshed", async () => {
    const created = await repository.refreshAdminRecommendations(jobId);
    expect(created).toBeGreaterThan(0);

    const recommendations = await repository.listJobRecommendations(jobId);
    expect(recommendations.length).toBeGreaterThan(0);
    const target = recommendations[0];

    await repository.createOutreachRequests(administratorId, jobId, [
      { recommendationId: target.id, phone: "+55 11 99999-0000", kind: target.kind, message: "Oi! Temos uma vaga que combina com você." },
    ]);
    expect(await repository.listOutreachRequests(jobId)).toHaveLength(1);

    // É isto que acontece hoje ao editar qualquer contato: o refresh roda de novo.
    await repository.refreshAdminRecommendations(jobId);

    const survivors = await repository.listOutreachRequests(jobId);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].message).toBe("Oi! Temos uma vaga que combina com você.");
  });

  it("survives two concurrent refreshes of the same job", async () => {
    // Com DELETE+INSERT, dois match_rerank simultâneos violavam UNIQUE (job_id,contact_id,kind)
    // e derrubavam o workflow inteiro. Com upsert, os dois têm de passar.
    const [first, second] = await Promise.all([
      repository.refreshAdminRecommendations(jobId),
      repository.refreshAdminRecommendations(jobId),
    ]);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(await repository.listOutreachRequests(jobId)).toHaveLength(1);
  });

  it("still drops recommendations that left the ranking without outreach", async () => {
    const before = await repository.listJobRecommendations(jobId);
    const withOutreach = (await repository.listOutreachRequests(jobId)).map(request => request.recommendationId);
    expect(before.length).toBeGreaterThan(withOutreach.length);

    // Ranking vazio: só o que tem outreach preparado pode sobreviver.
    await repository.replaceJobRecommendations(jobId, []);

    const after = await repository.listJobRecommendations(jobId);
    expect(after.map(item => item.id).sort()).toEqual([...withOutreach].sort());
  });
});
