import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integração real: exige Postgres com o schema aplicado (ver repository.outreach.test.ts).
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("network insights workflow deduplication", () => {
  let orchestrator: typeof import("./orchestrator");
  let db: typeof import("../platform/db");
  let administratorId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const repository = await import("../platform/repository");
    orchestrator = await import("./orchestrator");
    db = await import("../platform/db");

    const administrator = await repository.upsertAdministrator({ name: "Auditoria Fila", email: `fila-${Date.now()}@test.local` });
    administratorId = administrator.id;
    await repository.addAdminNetworkContact(administratorId, { name: "Contato da Fila", headline: "Product Manager" });
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("DELETE FROM orchestration_workflows WHERE entity_id=$1", [administratorId]);
    await db.query("DELETE FROM administrators WHERE id=$1", [administratorId]);
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
