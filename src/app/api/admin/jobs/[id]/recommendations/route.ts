import { NextResponse } from "next/server";
import { getAdminSession, isAdmin } from "@/lib/platform/auth";
import { listJobRecommendations } from "@/lib/platform/repository";
import { enqueueJobWorkflow } from "@/lib/orchestration/orchestrator";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;return NextResponse.json({recommendations:await listJobRecommendations(id)});}
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){const session=await getAdminSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;return NextResponse.json({workflowId:await enqueueJobWorkflow(id,session.administratorId)},{status:202});}
