import type { PoolClient } from "pg";
import { z } from "zod";
import { DEFAULT_ORGANIZATION_ID, query, transaction } from "../platform/db";

export type OrchestrationTaskType="job_analysis"|"profile_enrichment"|"match_rerank";
export type OrchestrationTask={id:string;workflowId:string;taskType:OrchestrationTaskType;payload:unknown;tokenBudget:number;timeoutSeconds:number;attempts:number;maxAttempts:number};
export type WorkflowStatus="pending"|"running"|"completed"|"failed"|"cancelled";
export type WorkflowListItem={id:string;kind:"job_activation"|"network_enrichment";entityType:string;entityId:string;status:WorkflowStatus;tokenBudget:number;estimatedCostUsd:number;taskCount:number;completedTasks:number;failedTasks:number;promptTokens:number;completionTokens:number;createdAt:string;completedAt:string|null;error:string|null};

const TaskResultSchema=z.object({model:z.string().optional(),promptTokens:z.number().int().nonnegative().optional(),completionTokens:z.number().int().nonnegative().optional()}).passthrough();

async function insertTask(client:PoolClient,input:{workflowId:string;taskType:OrchestrationTaskType;payload:unknown;dependsOn?:string[];tokenBudget:number;timeoutSeconds?:number;priority?:number}):Promise<string>{
  const rows=await client.query<{id:string}>(`INSERT INTO orchestration_tasks (workflow_id,task_type,payload,depends_on,idempotency_key,token_budget,timeout_seconds,priority)
    VALUES ($1,$2,$3::jsonb,$4::uuid[],$5,$6,$7,$8) RETURNING id`,[input.workflowId,input.taskType,JSON.stringify(input.payload),input.dependsOn??[],`${input.workflowId}:${input.taskType}:${crypto.randomUUID()}`,input.tokenBudget,input.timeoutSeconds??60,input.priority??100]);
  return rows.rows[0].id;
}

export async function enqueueJobWorkflow(jobId:string,requestedBy?:string):Promise<string>{
  return transaction(async client=>{
    const budget=3600;
    const workflow=(await client.query<{id:string}>(`INSERT INTO orchestration_workflows (organization_id,kind,entity_type,entity_id,token_budget,estimated_cost_usd,requested_by)
      VALUES ($1,'job_activation','job',$2,$3,.03,$4) RETURNING id`,[DEFAULT_ORGANIZATION_ID,jobId,budget,requestedBy??null])).rows[0];
    const analysisId=await insertTask(client,{workflowId:workflow.id,taskType:"job_analysis",payload:{jobId},tokenBudget:1200,timeoutSeconds:35,priority:50});
    await insertTask(client,{workflowId:workflow.id,taskType:"match_rerank",payload:{jobId},dependsOn:[analysisId],tokenBudget:2400,timeoutSeconds:55,priority:70});
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
    for(const contact of contacts)enrichmentIds.push(await insertTask(client,{workflowId:workflow.id,taskType:"profile_enrichment",payload:{administratorId,contactId:contact.id},tokenBudget:3600,timeoutSeconds:75,priority:60}));
    for(const job of jobs)await insertTask(client,{workflowId:workflow.id,taskType:"match_rerank",payload:{jobId:job.id},dependsOn:enrichmentIds,tokenBudget:2400,timeoutSeconds:55,priority:80});
    return {workflowId:workflow.id,profiles:contacts.length,jobs:jobs.length};
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
      UPDATE orchestration_tasks t SET status='running',attempts=t.attempts+1,locked_by=$1,lease_until=now()+make_interval(secs=>t.timeout_seconds+15),started_at=coalesce(t.started_at,now()),updated_at=now()
      FROM candidate WHERE t.id=candidate.id RETURNING t.id,t.workflow_id AS "workflowId",t.task_type AS "taskType",t.payload,t.token_budget AS "tokenBudget",t.timeout_seconds AS "timeoutSeconds",t.attempts,t.max_attempts AS "maxAttempts"`,[workerId]);
    if(!result.rows[0])return null;
    await client.query(`UPDATE orchestration_workflows SET status='running',started_at=coalesce(started_at,now()),updated_at=now() WHERE id=$1 AND status='pending'`,[result.rows[0].workflowId]);
    return result.rows[0];
  });
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
    else{await client.query(`UPDATE orchestration_tasks SET status='failed',error=$1,lease_until=NULL,locked_by=NULL,completed_at=now(),updated_at=now() WHERE id=$2`,[message,task.id]);await client.query(`UPDATE orchestration_workflows SET status='failed',error=$1,completed_at=now(),updated_at=now() WHERE id=$2`,[`${task.taskType}: ${message}`,task.workflowId]);}
  });
}

async function finishWorkflow(client:PoolClient,workflowId:string):Promise<void>{
  const remaining=await client.query<{count:number}>(`SELECT count(*)::int AS count FROM orchestration_tasks WHERE workflow_id=$1 AND status<>'completed'`,[workflowId]);
  if(remaining.rows[0].count===0)await client.query(`UPDATE orchestration_workflows SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1`,[workflowId]);
}

export async function listWorkflows(limit=20):Promise<WorkflowListItem[]>{return query<WorkflowListItem>(`SELECT w.id,w.kind,w.entity_type AS "entityType",w.entity_id AS "entityId",w.status,w.token_budget AS "tokenBudget",w.estimated_cost_usd AS "estimatedCostUsd",
  count(t.id)::int AS "taskCount",count(t.id) FILTER (WHERE t.status='completed')::int AS "completedTasks",count(t.id) FILTER (WHERE t.status='failed')::int AS "failedTasks",
  coalesce(sum(t.prompt_tokens),0)::int AS "promptTokens",coalesce(sum(t.completion_tokens),0)::int AS "completionTokens",w.created_at::text AS "createdAt",w.completed_at::text AS "completedAt",w.error
  FROM orchestration_workflows w LEFT JOIN orchestration_tasks t ON t.workflow_id=w.id WHERE w.organization_id=$1 GROUP BY w.id ORDER BY w.created_at DESC LIMIT $2`,[DEFAULT_ORGANIZATION_ID,Math.max(1,Math.min(limit,100))]);}
