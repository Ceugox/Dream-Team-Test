import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/platform/auth";
import { createInvitation } from "@/lib/platform/repository";
import { resolvePublicOrigin } from "@/lib/platform/publicOrigin";
export async function POST(request:Request){if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});const result=z.object({email:z.string().email().optional()}).safeParse(await request.json());if(!result.success)return NextResponse.json({error:"invalid"},{status:400});const invitation=await createInvitation(result.data.email);return NextResponse.json({id:invitation.id,url:`${resolvePublicOrigin(request)}/join/${invitation.token}`},{status:201});}
