import { z } from "zod";
import type { OrchestrationTask } from "./orchestrator";
import { analyzeJob, enrichAdminNetworkContact, generateAdminNetworkInsights, refreshAdminRecommendations } from "../platform/repository";

const JobPayload=z.object({jobId:z.uuid()});
const ProfilePayload=z.object({administratorId:z.uuid(),contactId:z.uuid()});

export async function executeTask(task:OrchestrationTask):Promise<unknown>{
  const abort=new AbortController();
  // O signal precisa chegar ao fetch: no TASK_TIMEOUT a requisição à LLM é cancelada de fato,
  // em vez de continuar viva em paralelo com a retentativa e escrever o resultado duas vezes.
  const work=async()=>{
    if(task.taskType==="job_analysis"){const {jobId}=JobPayload.parse(task.payload);return {...await analyzeJob(jobId,abort.signal),taskType:task.taskType};}
    if(task.taskType==="profile_enrichment"){const payload=ProfilePayload.parse(task.payload);return {...await enrichAdminNetworkContact(payload.administratorId,payload.contactId,abort.signal),taskType:task.taskType};}
    if(task.taskType==="match_rerank"){const {jobId}=JobPayload.parse(task.payload);return {count:await refreshAdminRecommendations(jobId,abort.signal),taskType:task.taskType};}
    if(task.taskType==="network_insights"){const {administratorId}=z.object({administratorId:z.guid()}).parse(task.payload);return {...await generateAdminNetworkInsights(administratorId,abort.signal),taskType:task.taskType};}
    throw new Error("UNKNOWN_TASK");
  };
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(new Error("TASK_TIMEOUT"));},task.timeoutSeconds*1000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
