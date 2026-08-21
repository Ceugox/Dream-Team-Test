import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integração real: exige Postgres com o schema aplicado (ver repository.outreach.test.ts).
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("network insights workflow deduplication", () => {
  let orchestrator: typeof import("./orchestrator");
  let repository: typeof import("../platform/repository");
  let db: typeof import("../platform/db");
  let administratorId: string;
  const createdJobs: string[] = [];
  const createdWorkflows: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    repository = await import("../platform/repository");
    orchestrator = await import("./orchestrator");
    db = await import("../platform/db");

    const administrator = await repository.upsertAdministrator({ name: "Auditoria Fila", email: `fila-${Date.now()}@test.local` });
    administratorId = administrator.id;
    await repository.addAdminNetworkContact(administratorId, { name: "Contato da Fila", headline: "Product Manager" });
  });

  afterAll(async () => {
    if (!db) return;
    // entity_id não é FK para jobs: apagar a vaga não leva o workflow, e a task sobrevivente
    // seria claimada por qualquer worker (ou por outro teste) depois.
    for (const workflowId of createdWorkflows) await db.query("DELETE FROM orchestration_workflows WHERE id=$1", [workflowId]);
    for (const jobId of createdJobs) await db.query("DELETE FROM jobs WHERE id=$1", [jobId]);
    await db.query("DELETE FROM orchestration_workflows WHERE entity_id=$1", [administratorId]);
    await db.query("DELETE FROM administrators WHERE id=$1", [administratorId]);
  });

  it("keeps the deterministic rerank claimable after the LLM analysis dies for good", async () => {
    const jobId = await repository.createJob({
      title: "Engenheiro de Plataforma", company: "Fila", location: "São Paulo",
      description: "Plataforma com Node e TypeScript, foco em confiabilidade.", status: "open",
    });
    createdJobs.push(jobId);

    const workflowId = await orchestrator.enqueueJobWorkflow(jobId, administratorId);
    createdWorkflows.push(workflowId);

    // Pega a análise pela fila e a mata como produção mataria: tentativas esgotadas.
    const analysis = await orchestrator.claimTask("worker-teste");
    expect(analysis?.taskType).toBe("job_analysis");
    await orchestrator.failTask({ ...analysis!, attempts: analysis!.maxAttempts }, new Error("OPENROUTER_429"));

    // O workflow não pode ser condenado enquanto sobra irmão executável: claimTask
    // ignora qualquer task de workflow failed, e era isso que zerava a vaga.
    const workflow = await db.query<{ status: string }>("SELECT status FROM orchestration_workflows WHERE id=$1", [workflowId]);
    expect(workflow[0].status).toBe("running");

    const rerank = await orchestrator.claimTask("worker-teste");
    expect(rerank?.taskType).toBe("match_rerank");

    // E a vaga não depende da fila para ter gente: o seed determinístico resolve na criação.
    expect(await repository.seedJobRecommendations(jobId)).toBeGreaterThan(0);
    expect(await repository.listJobRecommendations(jobId)).not.toHaveLength(0);
  });

  it("enriquece os contatos indicados, não a varredura por antiguidade", async () => {
    // O contato antigo é quem a varredura padrão escolheria; o alvo explícito tem de vencer.
    await repository.addAdminNetworkContact(administratorId, { name: "Alvo do Topo", headline: "Engenheiro de Software Sênior | Node" });
    const contacts = await repository.listAdminNetworkContacts(administratorId);
    const target = contacts.find(contact => contact.name === "Alvo do Topo");
    expect(target).toBeTruthy();

    const result = await orchestrator.enqueueNetworkEnrichmentWorkflow(administratorId, administratorId, { contactIds: [target!.id], limit: 10 });
    if (result.workflowId) createdWorkflows.push(result.workflowId);

    expect(result.profiles).toBe(1);
    const payloads = await db.query<{ payload: { contactId: string } }>(
      "SELECT payload FROM orchestration_tasks WHERE workflow_id=$1 AND task_type='profile_enrichment'", [result.workflowId]);
    expect(payloads.map(row => row.payload.contactId)).toEqual([target!.id]);
  });

  it("does not leave an orphan workflow when the hourly task already exists", async () => {
    const first = await orchestrator.enqueueNetworkInsightsWorkflow(administratorId, administratorId);
    expect(first).toBeTruthy();

    // Segundo sync na mesma hora: a task é deduplicada, então não deve nascer workflow algum.
    const second = await orchestrator.enqueueNetworkInsightsWorkflow(administratorId, administratorId);
    expect(second).toBeNull();

    const workflows = await db.query<{ id: string; status: string }>(
      "SELECT id,status FROM orchestration_workflows WHERE entity_id=$1 AND entity_type='network_insights'",
      [administratorId],
    );
    expect(workflows).toHaveLength(1);
    expect(workflows[0].id).toBe(first);

    const tasks = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM orchestration_tasks WHERE workflow_id=$1",
      [first],
    );
    expect(tasks[0].count).toBe("1");
  });
});
