import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/platform/auth";
import { buildLinkedInAuthorizationUrl, linkedInConnectionsEnabled, linkedInOAuthConfig } from "@/lib/platform/linkedin";

const STATE_COOKIE = "rc_linkedin_oauth_state";

function popupResponse(type: string, message: string, status = 200) {
  const payload = JSON.stringify({ type, message }).replaceAll("<", "\\u003c");
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexão LinkedIn</title><style>body{margin:0;background:#0b0d12;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:420px;border:1px solid #343949;border-radius:20px;background:#141720;padding:24px}p{color:#aeb4c0;line-height:1.6}button{min-height:48px;border:0;border-radius:12px;padding:0 18px;font-weight:600;cursor:pointer}</style><div class="card"><h1>Conexão LinkedIn</h1><p>${message}</p><button onclick="window.close()">Fechar</button></div><script>window.opener?.postMessage(${payload},location.origin)</script></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!(await getAdminSession())) return popupResponse("rc:linkedin-error", "Sua sessão expirou. Entre novamente e tente conectar.", 401);
  const config = linkedInOAuthConfig();
  if (!config) return popupResponse("rc:linkedin-unavailable", "A conexão LinkedIn ainda não foi ativada neste ambiente.", 503);
  const state = randomBytes(24).toString("base64url");
  const redirectUri = process.env.LINKEDIN_OAUTH_REDIRECT_URI?.trim() || `${new URL(request.url).origin}/api/admin/network/linkedin/callback`;
  const store = await cookies();
  store.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/admin/network/linkedin", maxAge: 10 * 60 });
  return NextResponse.redirect(buildLinkedInAuthorizationUrl({ clientId: config.clientId, redirectUri, state, includeConnections: linkedInConnectionsEnabled() }));
}
