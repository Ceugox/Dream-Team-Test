import { NextResponse } from "next/server";
import { z } from "zod";
import { setMemberSession } from "@/lib/platform/auth";
import { acceptInvitation } from "@/lib/platform/repository";
const Schema=z.object({name:z.string().min(2).max(100),email:z.string().email()});
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){const body=Schema.safeParse(await request.json());if(!body.success)return NextResponse.json({error:"INVALID"},{status:400});try{const member=await acceptInvitation((await params).token,body.data);await setMemberSession(member.memberId,member.organizationId);return NextResponse.json({ok:true});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"INVITATION_INVALID"},{status:400});}}
