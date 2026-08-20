import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/platform/auth";
import { canTransitionJob, jobStatuses } from "@/lib/platform/jobLifecycle";
import { getJob, refreshAdminRecommendations, updateJobStatus } from "@/lib/platform/repository";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;const job=await getJob(id);return job?NextResponse.json({job}):NextResponse.json({error:"not_found"},{status:404});}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const {id}=await params;const result=z.object({status:z.enum(jobStatuses)}).safeParse(await request.json());if(!result.success)return NextResponse.json({error:"invalid"},{status:400});const job=await getJob(id);if(!job)return NextResponse.json({error:"not_found"},{status:404});if(!canTransitionJob(job.status,result.data.status))return NextResponse.json({error:"invalid_transition"},{status:409});await updateJobStatus(id,result.data.status);if(result.data.status==="open")await refreshAdminRecommendations(id).catch(()=>0);return NextResponse.json({ok:true});}
