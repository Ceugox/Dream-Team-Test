import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminSession, verifyAdminKey } from "@/lib/platform/auth";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/platform/db";
import { upsertAdministrator } from "@/lib/platform/repository";

export async function POST(request: Request) {
  const result = z.object({ key:z.string().min(1).max(200),name:z.string().trim().min(2).max(120),email:z.email().max(255) }).safeParse(await request.json());
  if (!result.success || !verifyAdminKey(result.data.key)) return NextResponse.json({error:"unauthorized"},{status:401});
  const administrator=await upsertAdministrator({name:result.data.name,email:result.data.email});
  await setAdminSession(administrator.id,DEFAULT_ORGANIZATION_ID);
  return NextResponse.json({ok:true});
}
