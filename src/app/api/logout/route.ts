import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/platform/auth";

export async function POST(request: Request) {
  await clearSessions();
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
