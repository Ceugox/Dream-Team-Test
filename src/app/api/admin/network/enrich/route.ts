import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/platform/auth";
import { enqueueNetworkEnrichmentWorkflow } from "@/lib/orchestration/orchestrator";

export const maxDuration = 60;

export async function POST(){
  const session=await getAdminSession();
  if(!session)return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const result=await enqueueNetworkEnrichmentWorkflow(session.administratorId,session.administratorId,8);
    return NextResponse.json(result,{status:result.workflowId?202:200});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"enrichment_failed"},{status:503});
  }
}
