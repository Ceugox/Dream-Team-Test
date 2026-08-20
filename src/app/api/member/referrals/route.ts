import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemberSession } from "@/lib/platform/auth";
import { submitReferral } from "@/lib/platform/repository";
const Schema=z.object({jobId:z.string().uuid(),candidateName:z.string().min(2).max(120),candidateHeadline:z.string().max(300).nullable().optional(),linkedinUrl:z.string().url().nullable().optional(),relationshipNote:z.string().min(10).max(1000)});
export async function POST(request:Request){const session=await getMemberSession();if(!session)return NextResponse.json({error:"unauthorized"},{status:401});const body=Schema.safeParse(await request.json());if(!body.success)return NextResponse.json({error:"invalid",issues:body.error.issues},{status:400});try{await submitReferral(session.memberId,body.data);return NextResponse.json({ok:true},{status:201});}catch{return NextResponse.json({error:"referral_not_allowed"},{status:400});}}
