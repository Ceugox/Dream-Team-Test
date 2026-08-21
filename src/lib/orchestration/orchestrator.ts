import type { PoolClient } from "pg";
import { z } from "zod";
import { DEFAULT_ORGANIZATION_ID, query, transaction } from "../platform/db";

export type OrchestrationTaskType="job_analysis"|"profile_enrichment"|"match_rerank"|"network_insights";
export type OrchestrationTask={id:string;workflowId:string;taskType:OrchestrationTaskType;payload:unknown;tokenBudget:number;timeoutSeconds:number;attempts:number;maxAttempts:number};
export type WorkflowStatus="pending"|"running"|"completed"|"failed"|"cancelled";
export type WorkflowListItem={id:string;kind:"job_activation"|"network_enrichment";entityType:string;entityId:string;status:WorkflowStatus;tokenBudget:number;estimatedCostUsd:number;taskCount:number;completedTasks:number;failedTasks:number;promptTokens:number;completionTokens:number;createdAt:string;completedAt:string|null;error:string|null};

const TaskResultSchema=z.object({model:z.string().optional(),promptTokens:z.number().int().nonnegative().optional(),completionTokens:z.number().int().nonnegative().optional()}).passthrough();

async function insertTask(client:PoolClient,input:{workflowId:string;taskType:OrchestrationTaskType;payload:unknown;dependsOn?:string[];tokenBudget:number;timeoutSeconds?:number;priority?:number;idempotencyKey?:string}):Promise<{id:string;created:boolean}>{
  const idempotencyKey=input.idempotencyKey??`${input.workflowId}:${input.taskType}:${crypto.randomUUID()}`;
  const rows=await client.query<{id:string}>(`INSERT INTO orchestration_tasks (workflow_id,task_type,payload,depends_on,idempotency_key,token_budget,timeout_seconds,priority)
    VALUES ($1,$2,$3::jsonb,$4::uuid[],$5,$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,[input.workflowId,input.taskType,JSON.stringify(input.payload),input.dependsOn??[],idempotencyKey,input.tokenBudget,input.timeoutSeconds??60,input.priority??100]);
  if(rows.rows[0])return {id:rows.rows[0].id,created:true};
  // A task já existia (dedup por idempotencyKey) e pertence a outro workflow: quem chamou
  // precisa saber, senão nasce um workflow sem task nenhuma, eternamente "pending".
  const existing=await client.query<{id:string}>(`SELECT id FROM orchestration_tasks WHERE idempotency_key=$1`,[idempotencyKey]);
  return {id:existing.rows[0].id,created:false};
}

export async function enqueueJobWorkflow(jobId:string,requestedBy?:string):Promise<string>{
  return transaction(async client=>{
    const budget=3600;
    const workflow=(await client.query<{id:string}>(`INSERT INTO orchestration_workflows (organization_id,kind,entity_type,entity_id,token_budget,estimated_cost_usd,requested_by)
      VALUES ($1,'job_activation','job',$2,$3,.03,$4) RETURNING id`,[DEFAULT_ORGANIZATION_ID,jobId,budget,requestedBy??null])).rows[0];
    await insertTask(client,{workflowId:workflow.id,taskType:"job_analysis",payload:{jobId},tokenBudget:1200,timeoutSeconds:35,priority:50});
    // Sem dependsOn de propósito: quando job_analysis falhava de vez (quota, timeout, 5xx do
    // provedor), a match_rerank ficava pending para sempre e a vaga não tinha recomendação
    // nenhuma — nem as determinísticas, que não precisam de LLM. A prioridade mantém a
    // ordem preferida, e o rerank busca/cria a análise por conta própria se ainda não houver.
    await insertTask(client,{workflowId:workflow.id,taskType:"match_rerank",payload:{jobId},tokenBudget:2400,timeoutSeconds:55,priority:70});
    return workflow.id;
  });
}

export async function enqueueNetworkEnrichmentWorkflow(administratorId:string,requestedBy:string,limit=8):Promise<{workflowId:string|null;profiles:number;jobs:number}>{
  return transaction(async client=>{
    const contacts=(await client.query<{id:string}>(`SELECT id FROM admin_network_contacts WHERE organization_id=$1 AND administrator_id=$2
      AND (public_enriched_at IS NULL OR public_enriched_at<now()-interval '30 days') ORDER BY (CASE WHEN profile_context IS NULL THEN 0 ELSE 1 END),created_at DESC LIMIT $3`,[DEFAULT_ORGANIZATION_ID,administratorId,Math.max(1,Math.min(limit,8))])).rows;
    if(!contacts.length)return {workflowId:null,profiles:0,jobs:0};
    const jobs=(await client.query<{id:string}>(`SELECT id FROM jobs WHERE organization_id=$1 AND status='open' ORDER BY created_at DESC`,[DEFAULT_ORGANIZATION_ID])).rows;
    const tokenBudget=contacts.length*3600+jobs.length*2400;
    const workflow=(await client.query<{id:string}>(`INSERT INTO orchestration_workflows (organization_id,kind,entity_type,entity_id,token_budget,estimated_cost_usd,requested_by)
      VALUES ($1,'network_enrichment','administrator_network',$2,$3,$4,$5) RETURNING id`,[DEFAULT_ORGANIZATION_ID,administratorId,tokenBudget,contacts.length*.06+jobs.length*.02,requestedBy])).rows[0];
    const enrichmentIds:string[]=[];
    for(const contact of contacts)enrichmentIds.push((await insertTask(client,{workflowId:workflow.id,taskType:"profile_enrichment",payload:{administratorId,contactId:contact.id},tokenBudget:3600,timeoutSeconds:75,priority:60})).id);
    for(const job of jobs)await insertTask(client,{workflowId:workflow.id,taskType:"match_rerank",payload:{jobId:job.id},dependsOn:enrichmentIds,tokenBudget:2400,timeoutSeconds:55,priority:80});
    return {workflowId:workflow.id,profiles:contacts.length,jobs:jobs.length};
  });
}

export async function enqueueNetworkInsightsWorkflow(administratorId:string,requestedBy:string):Promise<string|null>{
  return transaction(async client=>{
    const count=(await client.query<{n:string}>(`SELECT count(*)::text AS n FROM admin_network_contacts WHERE organization_id=$1 AND administrator_id=$2`,[DEFAULT_ORGANIZATION_ID,administratorId])).rows[0];
    if(!count||Number(count.n)===0)return null;
    const workflow=(await client.query<{id:string}>(`INSERT INTO orchestration_workflows (organization_id,kind,entity_type,entity_id,token_budget,estimated_cost_usd,requested_by)
      VALUES ($1,'network_enrichment','network_insights',$2,$3,$4,$5) RETURNING id`,[DEFAULT_ORGANIZATION_ID,administratorId,4000,.02,requestedBy])).rows[0];
    // Dedup por hora: re-sincronizações seguidas não disparam a LLM repetidamente.
    const task=await insertTask(client,{workflowId:workflow.id,taskType:"network_insights",payload:{administratorId},tokenBudget:4000,timeoutSeconds:120,priority:70,idempotencyKey:`network_insights:${administratorId}:${new Date().toISOString().slice(0,13)}`});
    if(!task.created){
      // A task da hora já existe: este workflow ficaria sem nenhuma e travaria em "pending"
      // para sempre na tela de Inteligência. Desfaz e devolve nulo.
      await client.query(`DELETE FROM orchestration_workflows WHERE id=$1`,[workflow.id]);
      return null;
    }
    return workflow.id;
  });
}

export async function claimTask(workerId:string):Promise<OrchestrationTask|null>{
  return transaction(async client=>{
    const result=await client.query<OrchestrationTask>(`WITH candidate AS (
      SELECT t.id FROM orchestration_tasks t WHERE
        ((t.status IN ('pending','retry') AND t.available_at<=now()) OR (t.status='running' AND t.lease_until<now()))
        AND NOT EXISTS (SELECT 1 FROM unnest(t.depends_on) dependency JOIN orchestration_tasks d ON d.id=dependency WHERE d.status<>'completed')
        AND NOT EXISTS (SELECT 1 FROM orchestration_workflows w WHERE w.id=t.workflow_id AND w.status IN ('failed','cancelled'))
      ORDER BY t.priority,t.created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE orchestration_tasks t SET status='running',attempts=t.attempts+1,locked_by=$1,lease_until=now()+make_interval(secs=>90),started_at=coalesce(t.started_at,now()),updated_at=now()
      FROM candidate WHERE t.id=candidate.id RETURNING t.id,t.workflow_id AS "workflowId",t.task_type AS "taskType",t.payload,t.token_budget AS "tokenBudget",t.timeout_seconds AS "timeoutSeconds",t.attempts,t.max_attempts AS "maxAttempts"`,[workerId]);
    if(!result.rows[0])return null;
    await client.query(`UPDATE orchestration_workflows SET status='running',started_at=coalesce(started_at,now()),updated_at=now() WHERE id=$1 AND status='pending'`,[result.rows[0].workflowId]);
    return result.rows[0];
  });
}

// Lease curto (90s) renovado por heartbeat: se o worker morrer por deploy/crash,
// a task volta para a fila em no máximo ~2 minutos em vez de esperar o timeout inteiro.
export async function extendTaskLease(taskId:string,workerId:string):Promise<void>{
  await query(`UPDATE orchestration_tasks SET lease_until=now()+make_interval(secs=>90),updated_at=now()
    WHERE id=$1 AND locked_by=$2 AND status='running'`,[taskId,workerId]);
}

export async function completeTask(task:OrchestrationTask,result:unknown):Promise<void>{
  const usage=TaskResultSchema.safeParse(result);const parsed=usage.success?usage.data:{};
  await transaction(async client=>{
    await client.query(`UPDATE orchestration_tasks SET status='completed',result=$1::jsonb,model=$2,prompt_tokens=$3,completion_tokens=$4,lease_until=NULL,locked_by=NULL,completed_at=now(),updated_at=now() WHERE id=$5`,[JSON.stringify(result??{}),parsed.model??null,parsed.promptTokens??0,parsed.completionTokens??0,task.id]);
    const budget=await client.query<{token_budget:number;spent:number}>(`SELECT w.token_budget,coalesce(sum(t.prompt_tokens+t.completion_tokens),0)::int AS spent FROM orchestration_workflows w JOIN orchestration_tasks t ON t.workflow_id=w.id WHERE w.id=$1 GROUP BY w.id`,[task.workflowId]);
    if(budget.rows[0]&&budget.rows[0].spent>budget.rows[0].token_budget){await client.query(`UPDATE orchestration_tasks SET status='cancelled',error='WORKFLOW_TOKEN_BUDGET_EXCEEDED',completed_at=now(),updated_at=now() WHERE workflow_id=$1 AND status IN ('pending','retry')`,[task.workflowId]);await client.query(`UPDATE orchestration_workflows SET status='failed',error='Orçamento de tokens excedido',completed_at=now(),updated_at=now() WHERE id=$1`,[task.workflowId]);return;}
    await finishWorkflow(client,task.workflowId);
  });
}

export async function failTask(task:OrchestrationTask,error:unknown):Promise<void>{
  const message=(error instanceof Error?error.message:String(error)).slice(0,1000);
  await transaction(async client=>{
    if(task.attempts<task.maxAttempts){const delay=Math.min(300,5*2**(task.attempts-1));await client.query(`UPDATE orchestration_tasks SET status='retry',error=$1,available_at=now()+make_interval(secs=>$2),lease_until=NULL,locked_by=NULL,updated_at=now() WHERE id=$3`,[message,delay,task.id]);}
    else{
      await client.query(`UPDATE orchestration_tasks SET status='failed',error=$1,lease_until=NULL,locked_by=NULL,completed_at=now(),updated_at=now() WHERE id=$2`,[message,task.id]);
      // Não condenar o workflow aqui: claimTask ignora toda task de workflow failed, então
      // marcar failed na primeira baixa matava os irmãos que ainda podiam rodar — era o que
      // deixava a vaga sem nenhuma recomendação quando a análise por LLM falhava.
      await settleWorkflow(client,task.workflowId,`${task.taskType}: ${message}`);
    }
  });
}

// Só decide o destino do workflow quando não há mais nada executável nele.
async function settleWorkflow(client:PoolClient,workflowId:string,error:string|null):Promise<void>{
  const executable=await client.query<{count:number}>(`SELECT count(*)::int AS count FROM orchestration_tasks WHERE workflow_id=$1 AND status IN ('pending','retry','running')`,[workflowId]);
  if(executable.rows[0].count>0)return;
  const failed=await client.query<{count:number}>(`SELECT count(*)::int AS count FROM orchestration_tasks WHERE workflow_id=$1 AND status='failed'`,[workflowId]);
  const broke=failed.rows[0].count>0;
  await client.query(`UPDATE orchestration_workflows SET status=$1,error=coalesce($2,error),completed_at=now(),updated_at=now() WHERE id=$3`,[broke?"failed":"completed",broke?error:null,workflowId]);
}

async function finishWorkflow(client:PoolClient,workflowId:string):Promise<void>{
  await settleWorkflow(client,workflowId,null);
}

export async function listWorkflows(limit=20):Promise<WorkflowListItem[]>{return query<WorkflowListItem>(`SELECT w.id,w.kind,w.entity_type AS "entityType",w.entity_id AS "entityId",w.status,w.token_budget AS "tokenBudget",w.estimated_cost_usd AS "estimatedCostUsd",
  count(t.id)::int AS "taskCount",count(t.id) FILTER (WHERE t.status='completed')::int AS "completedTasks",count(t.id) FILTER (WHERE t.status='failed')::int AS "failedTasks",
  coalesce(sum(t.prompt_tokens),0)::int AS "promptTokens",coalesce(sum(t.completion_tokens),0)::int AS "completionTokens",w.created_at::text AS "createdAt",w.completed_at::text AS "completedAt",w.error
  FROM orchestration_workflows w LEFT JOIN orchestration_tasks t ON t.workflow_id=w.id WHERE w.organization_id=$1 GROUP BY w.id ORDER BY w.created_at DESC LIMIT $2`,[DEFAULT_ORGANIZATION_ID,Math.max(1,Math.min(limit,100))]);}
