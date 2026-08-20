import { claimTask, completeTask, failTask } from "../src/lib/orchestration/orchestrator";
import { executeTask } from "../src/lib/orchestration/handlers";

const workerId=`worker-${process.env.RAILWAY_REPLICA_ID||process.pid}-${crypto.randomUUID().slice(0,8)}`;
const pollMs=Math.max(500,Number(process.env.WORKER_POLL_MS)||2000);
const parallel=Math.max(1,Math.min(3,Number(process.env.WORKER_CONCURRENCY)||3));
let stopping=false;
process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});

async function processOne():Promise<boolean>{const task=await claimTask(workerId);if(!task)return false;try{const result=await executeTask(task);await completeTask(task,result);}catch(error){await failTask(task,error);}return true;}

console.log(JSON.stringify({event:"worker_started",workerId,parallel,pollMs}));
while(!stopping){const processed=await Promise.all(Array.from({length:parallel},()=>processOne()));if(!processed.some(Boolean))await new Promise(resolve=>setTimeout(resolve,pollMs));}
console.log(JSON.stringify({event:"worker_stopped",workerId}));
