import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { createJob } from "@/lib/platform/repository";
import { enqueueJobWorkflow } from "@/lib/orchestration/orchestrator";
const Schema=z.object({title:z.string().min(3).max(120),company:z.string().min(2).max(120),location:z.string().max(120).optional(),description:z.string().min(20).max(20000),status:z.enum(["draft","open"]).optional()});
export async function POST(request:Request){const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const result=Schema.safeParse(await request.json());if(!result.success)return NextResponse.json({error:"invalid",issues:result.error.issues},{status:400});const id=await createJob(result.data);const workflowId=(result.data.status??"open")==="open"?await enqueueJobWorkflow(id,session.administratorId):null;return NextResponse.json({id,workflowId},{status:201});}
