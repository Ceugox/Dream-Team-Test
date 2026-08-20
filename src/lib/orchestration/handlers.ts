import { z } from "zod";
import type { OrchestrationTask } from "./orchestrator";
import { analyzeJob, enrichAdminNetworkContact, refreshAdminRecommendations } from "../platform/repository";

const JobPayload=z.object({jobId:z.uuid()});
const ProfilePayload=z.object({administratorId:z.uuid(),contactId:z.uuid()});

export async function executeTask(task:OrchestrationTask):Promise<unknown>{
  const work=async()=>{
    if(task.taskType==="job_analysis"){const {jobId}=JobPayload.parse(task.payload);return {...await analyzeJob(jobId),taskType:task.taskType};}
    if(task.taskType==="profile_enrichment"){const payload=ProfilePayload.parse(task.payload);return {...await enrichAdminNetworkContact(payload.administratorId,payload.contactId),taskType:task.taskType};}
    if(task.taskType==="match_rerank"){const {jobId}=JobPayload.parse(task.payload);return {count:await refreshAdminRecommendations(jobId),taskType:task.taskType};}
    throw new Error("UNKNOWN_TASK");
  };
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("TASK_TIMEOUT")),task.timeoutSeconds*1000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
