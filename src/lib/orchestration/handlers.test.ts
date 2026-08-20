import { beforeEach,describe,expect,it,vi } from "vitest";
import { executeTask } from "./handlers";
import type { OrchestrationTask } from "./orchestrator";
import * as repository from "../platform/repository";
import * as orchestrator from "./orchestrator";
import * as runtime from "../linkedin/runtime";

vi.mock("../platform/repository",()=>({analyzeJob:vi.fn(),enrichAdminNetworkContact:vi.fn(),refreshAdminRecommendations:vi.fn(),listJobs:vi.fn()}));
vi.mock("./orchestrator",()=>({cancelLinkedInWorkflow:vi.fn(),enqueueLinkedInProfileTasks:vi.fn()}));
vi.mock("../linkedin/runtime",()=>({getLinkedInSyncService:vi.fn()}));

const base:OrchestrationTask={id:"task",workflowId:"workflow",taskType:"job_analysis",payload:{jobId:"11111111-1111-4111-8111-111111111111"},tokenBudget:1200,timeoutSeconds:1,attempts:1,maxAttempts:3};
const owner={type:"admin" as const,id:"22222222-2222-4222-8222-222222222222",organizationId:"33333333-3333-4333-8333-333333333333"};
const sessionId="44444444-4444-4444-8444-444444444444";

function fakeService(overrides:Partial<Record<"runInventoryStage"|"runProfileStage"|"finalizeStage"|"releaseStuckSession",unknown>>={}){
  const service={
    runInventoryStage:vi.fn(async()=>({session:{status:"enriching"},profileUrls:["https://www.linkedin.com/in/a"]})),
    runProfileStage:vi.fn(async()=>({status:"results_available",enrichedCount:1,failedCount:0})),
    finalizeStage:vi.fn(async()=>({status:"completed",enrichedCount:2,failedCount:0})),
    releaseStuckSession:vi.fn(async()=>({status:"failed"})),
    ...overrides,
  };
  vi.mocked(runtime.getLinkedInSyncService).mockReturnValue(service as never);
  return service;
}

describe("orchestration task handlers",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("dispatches a job analysis with a bounded payload",async()=>{
    vi.mocked(repository.analyzeJob).mockResolvedValue({model:"gemini",promptTokens:10,completionTokens:5,cached:false});
    await expect(executeTask(base)).resolves.toMatchObject({taskType:"job_analysis",model:"gemini"});
    expect(repository.analyzeJob).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });
  it("rejects malformed handoff contracts before executing a specialist",async()=>{
    await expect(executeTask({...base,payload:{jobId:"not-a-uuid"}})).rejects.toThrow();
    expect(repository.analyzeJob).not.toHaveBeenCalled();
  });
  it("enforces the task timeout",async()=>{
    vi.mocked(repository.analyzeJob).mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({model:"late",promptTokens:0,completionTokens:0,cached:false}),50)));
    await expect(executeTask({...base,timeoutSeconds:.005})).rejects.toThrow("TASK_TIMEOUT");
  });

  it("runs the LinkedIn inventory stage with an abortable signal and enqueues the profile chain",async()=>{
    const service=fakeService();
    vi.mocked(orchestrator.enqueueLinkedInProfileTasks).mockResolvedValue(1);
    const result=await executeTask({...base,taskType:"linkedin_inventory",payload:{sessionId,owner}});
    expect(result).toMatchObject({taskType:"linkedin_inventory",status:"enriching",profiles:1});
    expect(service.runInventoryStage).toHaveBeenCalledWith(owner,sessionId,expect.objectContaining({signal:expect.any(AbortSignal)}));
    expect(orchestrator.enqueueLinkedInProfileTasks).toHaveBeenCalledWith("workflow",sessionId,owner,["https://www.linkedin.com/in/a"]);
    expect(orchestrator.cancelLinkedInWorkflow).not.toHaveBeenCalled();
  });

  it("releases a session stuck mid-collection by a dead worker and cancels the workflow",async()=>{
    const service=fakeService({runInventoryStage:vi.fn(async()=>({session:{status:"inventorying"},profileUrls:[]}))});
    const result=await executeTask({...base,taskType:"linkedin_inventory",payload:{sessionId,owner}});
    expect(result).toMatchObject({status:"failed",profiles:0});
    expect(service.releaseStuckSession).toHaveBeenCalledWith(owner,sessionId);
    expect(orchestrator.cancelLinkedInWorkflow).toHaveBeenCalledWith("workflow","linkedin_session_inventorying_stale");
    expect(orchestrator.enqueueLinkedInProfileTasks).not.toHaveBeenCalled();
  });

  it("cancels the pending workflow tasks when the session pauses",async()=>{
    fakeService({runInventoryStage:vi.fn(async()=>({session:{status:"needs_attention"},profileUrls:[]}))});
    const result=await executeTask({...base,taskType:"linkedin_inventory",payload:{sessionId,owner}});
    expect(result).toMatchObject({status:"needs_attention",profiles:0});
    expect(orchestrator.cancelLinkedInWorkflow).toHaveBeenCalledWith("workflow","linkedin_session_needs_attention");
    expect(orchestrator.enqueueLinkedInProfileTasks).not.toHaveBeenCalled();
  });

  it("collects a profile without spending inference tokens",async()=>{
    const service=fakeService();
    const result=await executeTask({...base,taskType:"linkedin_profile_collect",payload:{sessionId,owner,profileUrl:"https://www.linkedin.com/in/a"}});
    expect(result).toMatchObject({taskType:"linkedin_profile_collect",status:"results_available"});
    expect(service.runProfileStage).toHaveBeenCalledWith(owner,sessionId,"https://www.linkedin.com/in/a",expect.objectContaining({signal:expect.any(AbortSignal)}));
    expect(repository.refreshAdminRecommendations).not.toHaveBeenCalled();
  });

  it("cancels remaining profile tasks when a profile stage pauses on rate limit",async()=>{
    fakeService({runProfileStage:vi.fn(async()=>({status:"paused_rate_limit",enrichedCount:1,failedCount:0}))});
    const result=await executeTask({...base,taskType:"linkedin_profile_collect",payload:{sessionId,owner,profileUrl:"https://www.linkedin.com/in/a"}});
    expect(result).toMatchObject({status:"paused_rate_limit"});
    expect(orchestrator.cancelLinkedInWorkflow).toHaveBeenCalledWith("workflow","linkedin_session_paused_rate_limit");
    expect(repository.refreshAdminRecommendations).not.toHaveBeenCalled();
  });

  it("finalizes the session and refreshes matching with structured data only",async()=>{
    const service=fakeService();
    vi.mocked(repository.listJobs).mockResolvedValue([{id:"55555555-5555-4555-8555-555555555555",title:"Head of Payments",company:"FinCo",location:null,description:"",status:"open",createdAt:"",referralCount:0}] as never);
    vi.mocked(repository.refreshAdminRecommendations).mockResolvedValue(3);
    const result=await executeTask({...base,taskType:"linkedin_finalize",payload:{sessionId,owner}});
    expect(result).toMatchObject({taskType:"linkedin_finalize",status:"completed",enriched:2,failed:0,matchesRefreshed:3});
    expect(service.finalizeStage).toHaveBeenCalledWith(owner,sessionId);
    expect(repository.refreshAdminRecommendations).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555");
    const calls=[...vi.mocked(repository.refreshAdminRecommendations).mock.calls.flat()];
    expect(JSON.stringify(calls)).not.toMatch(/cookie|password|providerSession|linkedin\.com/i);
  });

  it("rejects a malformed LinkedIn payload before touching the browser session",async()=>{
    const service=fakeService();
    await expect(executeTask({...base,taskType:"linkedin_profile_collect",payload:{sessionId,owner,profileUrl:"not-a-url"}})).rejects.toThrow();
    expect(service.runProfileStage).not.toHaveBeenCalled();
  });
});
