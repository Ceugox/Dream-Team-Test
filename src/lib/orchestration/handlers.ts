import { z } from "zod";
import type { OrchestrationTask } from "./orchestrator";
import { analyzeJob, enrichAdminNetworkContact, generateAdminNetworkInsights, listJobs, refreshAdminRecommendations } from "../platform/repository";

const JobPayload=z.object({jobId:z.uuid()});
const ProfilePayload=z.object({administratorId:z.uuid(),contactId:z.uuid()});
async function refreshOpenJobMatching():Promise<number>{
  const jobs=await listJobs();
  let refreshed=0;
  for(const job of jobs.filter(item=>item.status==="open")){
    // Fallback determinístico mora dentro de refreshAdminRecommendations; erro de LLM não derruba a coleta.
    refreshed+=await refreshAdminRecommendations(job.id).catch(()=>0);
  }
  return refreshed;
}

export async function executeTask(task:OrchestrationTask):Promise<unknown>{
  const abort=new AbortController();
  const work=async()=>{
    if(task.taskType==="job_analysis"){const {jobId}=JobPayload.parse(task.payload);return {...await analyzeJob(jobId),taskType:task.taskType};}
    if(task.taskType==="profile_enrichment"){const payload=ProfilePayload.parse(task.payload);return {...await enrichAdminNetworkContact(payload.administratorId,payload.contactId),taskType:task.taskType};}
    if(task.taskType==="match_rerank"){const {jobId}=JobPayload.parse(task.payload);return {count:await refreshAdminRecommendations(jobId),taskType:task.taskType};}
    if(task.taskType==="network_insights"){const {administratorId}=z.object({administratorId:z.guid()}).parse(task.payload);return {...await generateAdminNetworkInsights(administratorId),taskType:task.taskType};}
    throw new Error("UNKNOWN_TASK");
  };
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(new Error("TASK_TIMEOUT"));},task.timeoutSeconds*1000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
