import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/platform/auth";
import { enrichAdminNetworkContacts, listJobs, refreshAdminRecommendations } from "@/lib/platform/repository";

export const maxDuration = 60;

export async function POST(){
  const session=await getAdminSession();
  if(!session)return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const result=await enrichAdminNetworkContacts(session.administratorId,4);
    if(result.enriched>0){
      const jobs=await listJobs();
      await Promise.all(jobs.filter(job=>job.status==="open").map(job=>refreshAdminRecommendations(job.id)));
    }
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"enrichment_failed"},{status:503});
  }
}
