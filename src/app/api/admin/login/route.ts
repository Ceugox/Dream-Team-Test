import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminSession, verifyAdminKey } from "@/lib/platform/auth";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/platform/db";
import { upsertAdministrator } from "@/lib/platform/repository";
import { checkRateLimit, clientKey, type RateLimitBucket } from "@/lib/platform/rateLimit";

// A chave de admin é única e compartilhada: sem teto por IP, força brutá-la é só questão de tempo.
const attempts: RateLimitBucket = new Map();
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const limit = checkRateLimit(attempts, clientKey(request), { now: Date.now(), limit: ATTEMPT_LIMIT, windowMs: ATTEMPT_WINDOW_MS });
  if (!limit.allowed) return NextResponse.json({error:"too_many_attempts"},{status:429,headers:{"Retry-After":String(limit.retryAfterSeconds)}});
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({error:"invalid_json"},{status:400}); }
  const result = z.object({ key:z.string().min(1).max(200),name:z.string().trim().min(2).max(120),email:z.email().max(255) }).safeParse(body);
  if (!result.success || !verifyAdminKey(result.data.key)) return NextResponse.json({error:"unauthorized"},{status:401});
  const administrator=await upsertAdministrator({name:result.data.name,email:result.data.email});
  await setAdminSession(administrator.id,DEFAULT_ORGANIZATION_ID);
  return NextResponse.json({ok:true});
}
