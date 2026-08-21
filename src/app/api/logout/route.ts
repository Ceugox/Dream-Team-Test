import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/platform/auth";
import { resolvePublicOrigin } from "@/lib/platform/publicOrigin";

export async function POST(request: Request) {
  await clearSessions();
  // Behind the proxy request.url carries the internal container host, which the browser cannot resolve.
  return NextResponse.redirect(new URL("/admin/login", resolvePublicOrigin(request)), 303);
}
