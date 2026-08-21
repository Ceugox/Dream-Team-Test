import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { enqueueNetworkEnrichmentWorkflow } from "@/lib/orchestration/orchestrator";
import { isEnrichmentEnabled } from "@/lib/enrichment/publicProfile";
import { listTopRankedContactIds } from "@/lib/platform/repository";

export const maxDuration = 60;

// jobId direciona o enriquecimento aos melhores ranqueados daquela vaga, em vez de varrer a
// rede por ordem de "quem nunca foi pesquisado".
const Schema = z.object({ jobId: z.uuid().optional(), limit: z.number().int().min(1).max(10).optional() });

export async function POST(request:Request){
  const session=await getAdminSession();
  if(!session)return NextResponse.json({error:"unauthorized"},{status:401});
  // O enriquecimento manda nome e URL de LinkedIn de pessoas reais para o provedor de LLM com
  // busca web — único caminho do produto que expõe PII. Desligado por padrão, como o import do Google.
  if(!isEnrichmentEnabled())return NextResponse.json({error:"enrichment_disabled"},{status:503});

  let body: unknown = {};
  try { body = request.headers.get("content-type")?.includes("json") ? await request.json() : {}; }
  catch { return NextResponse.json({error:"invalid_json"},{status:400}); }
  const parsed=Schema.safeParse(body ?? {});
  if(!parsed.success)return NextResponse.json({error:"invalid"},{status:400});

  try{
    const contactIds=parsed.data.jobId
      ? await listTopRankedContactIds(parsed.data.jobId,parsed.data.limit??10)
      : undefined;
    if(parsed.data.jobId&&!contactIds?.length)
      return NextResponse.json({workflowId:null,profiles:0,jobs:0,reason:"sem_recomendacoes"},{status:200});

    const result=await enqueueNetworkEnrichmentWorkflow(session.administratorId,session.administratorId,{limit:parsed.data.limit,contactIds});
    return NextResponse.json(result,{status:result.workflowId?202:200});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"enrichment_failed"},{status:503});
  }
}
