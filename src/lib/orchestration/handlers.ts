import { z } from "zod";
import type { OrchestrationTask } from "./orchestrator";
import { cancelLinkedInWorkflow, enqueueLinkedInProfileTasks } from "./orchestrator";
import { getLinkedInSyncService } from "../linkedin/runtime";
import type { LinkedInSessionStatus } from "../linkedin/types";
import { analyzeJob, enrichAdminNetworkContact, listJobs, refreshAdminRecommendations } from "../platform/repository";

const JobPayload=z.object({jobId:z.uuid()});
const ProfilePayload=z.object({administratorId:z.uuid(),contactId:z.uuid()});
const LinkedInOwnerPayload=z.object({type:z.enum(["admin","member"]),id:z.uuid(),organizationId:z.uuid()});
const LinkedInSessionPayload=z.object({sessionId:z.uuid(),owner:LinkedInOwnerPayload});
const LinkedInProfilePayload=LinkedInSessionPayload.extend({profileUrl:z.string().url()});

const CONTINUABLE_STATUSES:LinkedInSessionStatus[]=["enriching","results_available","completed"];

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
  const work=async()=>{
    if(task.taskType==="job_analysis"){const {jobId}=JobPayload.parse(task.payload);return {...await analyzeJob(jobId),taskType:task.taskType};}
    if(task.taskType==="profile_enrichment"){const payload=ProfilePayload.parse(task.payload);return {...await enrichAdminNetworkContact(payload.administratorId,payload.contactId),taskType:task.taskType};}
    if(task.taskType==="match_rerank"){const {jobId}=JobPayload.parse(task.payload);return {count:await refreshAdminRecommendations(jobId),taskType:task.taskType};}
    if(task.taskType==="linkedin_inventory"){
      const {sessionId,owner}=LinkedInSessionPayload.parse(task.payload);
      const {session,profileUrls}=await getLinkedInSyncService().runInventoryStage(owner,sessionId);
      if(!session||session.status!=="enriching"){
        await cancelLinkedInWorkflow(task.workflowId,`linkedin_session_${session?.status??"missing"}`);
        return {taskType:task.taskType,status:session?.status??null,profiles:0};
      }
      const enqueued=await enqueueLinkedInProfileTasks(task.workflowId,sessionId,owner,profileUrls);
      return {taskType:task.taskType,status:session.status,profiles:enqueued};
    }
    if(task.taskType==="linkedin_profile_collect"){
      const {sessionId,owner,profileUrl}=LinkedInProfilePayload.parse(task.payload);
      const session=await getLinkedInSyncService().runProfileStage(owner,sessionId,profileUrl);
      if(!session||!CONTINUABLE_STATUSES.includes(session.status)){
        await cancelLinkedInWorkflow(task.workflowId,`linkedin_session_${session?.status??"missing"}`);
        return {taskType:task.taskType,status:session?.status??null,matchesRefreshed:0};
      }
      const matchesRefreshed=owner.type==="admin"?await refreshOpenJobMatching():0;
      return {taskType:task.taskType,status:session.status,matchesRefreshed};
    }
    if(task.taskType==="linkedin_finalize"){
      const {sessionId,owner}=LinkedInSessionPayload.parse(task.payload);
      const session=await getLinkedInSyncService().finalizeStage(owner,sessionId);
      return {taskType:task.taskType,status:session?.status??null,enriched:session?.enrichedCount??0,failed:session?.failedCount??0};
    }
    throw new Error("UNKNOWN_TASK");
  };
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("TASK_TIMEOUT")),task.timeoutSeconds*1000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
