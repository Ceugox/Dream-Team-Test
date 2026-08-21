import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/platform/auth";
import { enqueueNetworkEnrichmentWorkflow } from "@/lib/orchestration/orchestrator";
import { isEnrichmentEnabled } from "@/lib/enrichment/publicProfile";

export const maxDuration = 60;

export async function POST(){
  const session=await getAdminSession();
  if(!session)return NextResponse.json({error:"unauthorized"},{status:401});
  // O enriquecimento manda nome e URL de LinkedIn de pessoas reais para o provedor de LLM com
  // busca web — único caminho do produto que expõe PII. Desligado por padrão, como o import do Google.
  if(!isEnrichmentEnabled())return NextResponse.json({error:"enrichment_disabled"},{status:503});
  try{
    const result=await enqueueNetworkEnrichmentWorkflow(session.administratorId,session.administratorId,8);
    return NextResponse.json(result,{status:result.workflowId?202:200});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"enrichment_failed"},{status:503});
  }
}
