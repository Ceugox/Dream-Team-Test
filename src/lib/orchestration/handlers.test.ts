import { beforeEach,describe,expect,it,vi } from "vitest";
import { executeTask } from "./handlers";
import type { OrchestrationTask } from "./orchestrator";
import * as repository from "../platform/repository";

vi.mock("../platform/repository",()=>({analyzeJob:vi.fn(),enrichAdminNetworkContact:vi.fn(),refreshAdminRecommendations:vi.fn(),listJobs:vi.fn(),generateAdminNetworkInsights:vi.fn()}));

const base:OrchestrationTask={id:"task",workflowId:"workflow",taskType:"job_analysis",payload:{jobId:"11111111-1111-4111-8111-111111111111"},tokenBudget:1200,timeoutSeconds:1,attempts:1,maxAttempts:3};

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
});
