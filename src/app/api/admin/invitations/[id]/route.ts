import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/platform/auth";
import { deleteInvitation, regenerateInvitationToken, revokeInvitation } from "@/lib/platform/repository";
import { resolvePublicOrigin } from "@/lib/platform/publicOrigin";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});
  const body=z.object({action:z.enum(["revoke","regenerate"])}).safeParse(await request.json());
  if(!body.success)return NextResponse.json({error:"invalid"},{status:400});
  const {id}=await params;
  if(body.data.action==="revoke"){
    const ok=await revokeInvitation(id);
    return ok?NextResponse.json({ok:true}):NextResponse.json({error:"not_pending"},{status:409});
  }
  const token=await regenerateInvitationToken(id);
  return token?NextResponse.json({url:`${resolvePublicOrigin(request)}/join/${token}`}):NextResponse.json({error:"not_pending"},{status:409});
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isAdmin()))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  const ok=await deleteInvitation(id);
  return ok?NextResponse.json({ok:true}):NextResponse.json({error:"not_found"},{status:404});
}
