import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminSession, verifyAdminKey } from "@/lib/platform/auth";

export async function POST(request: Request) {
  const result = z.object({ key:z.string().min(1).max(200) }).safeParse(await request.json());
  if (!result.success || !verifyAdminKey(result.data.key)) return NextResponse.json({error:"unauthorized"},{status:401});
  await setAdminSession();
  return NextResponse.json({ok:true});
}
