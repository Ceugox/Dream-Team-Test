import { claimTask, completeTask, failTask } from "../src/lib/orchestration/orchestrator";
import { executeTask } from "../src/lib/orchestration/handlers";

const workerId=`worker-${process.env.RAILWAY_REPLICA_ID||process.pid}-${crypto.randomUUID().slice(0,8)}`;
const pollMs=Math.max(500,Number(process.env.WORKER_POLL_MS)||2000);
const parallel=Math.max(1,Math.min(3,Number(process.env.WORKER_CONCURRENCY)||3));
let stopping=false;
process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});

async function processOne():Promise<boolean>{const task=await claimTask(workerId);if(!task)return false;console.log(JSON.stringify({event:"task_started",taskId:task.id,workflowId:task.workflowId,taskType:task.taskType,attempt:task.attempts}));try{const result=await executeTask(task);await completeTask(task,result);console.log(JSON.stringify({event:"task_completed",taskId:task.id,workflowId:task.workflowId,taskType:task.taskType}));}catch(error){await failTask(task,error);console.error(JSON.stringify({event:"task_failed",taskId:task.id,workflowId:task.workflowId,taskType:task.taskType,attempt:task.attempts,error:error instanceof Error?error.message:"UNKNOWN"}));}return true;}

console.log(JSON.stringify({event:"worker_started",workerId,parallel,pollMs}));
while(!stopping){try{const processed=await Promise.all(Array.from({length:parallel},()=>processOne()));if(!processed.some(Boolean))await new Promise(resolve=>setTimeout(resolve,pollMs));}catch(error){console.error(JSON.stringify({event:"worker_loop_error",error:error instanceof Error?error.message:"UNKNOWN"}));await new Promise(resolve=>setTimeout(resolve,Math.max(5000,pollMs)));}}
console.log(JSON.stringify({event:"worker_stopped",workerId}));
