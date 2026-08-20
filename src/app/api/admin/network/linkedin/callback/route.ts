import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { linkedInConnectionsEnabled, linkedInOAuthConfig, parseLinkedInConnections, type LinkedInContact } from "@/lib/platform/linkedin";
import { listJobs, refreshAdminRecommendations, replaceLinkedInAdminNetworkContacts } from "@/lib/platform/repository";

const STATE_COOKIE = "rc_linkedin_oauth_state";
const TokenSchema = z.object({ access_token: z.string().min(1), scope: z.string().optional() });
const UserSchema = z.object({ sub: z.string().optional(), email: z.string().email().optional() });

function popupResponse(origin: string, type: string, message: string, count?: number, status = 200) {
  const payload = JSON.stringify({ type, message, count }).replaceAll("<", "\\u003c");
  const safeMessage = message.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!);
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexão LinkedIn</title><style>body{margin:0;background:#0b0d12;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:420px;border:1px solid #343949;border-radius:20px;background:#141720;padding:24px}p{color:#aeb4c0;line-height:1.6}button{min-height:48px;border:0;border-radius:12px;padding:0 18px;font-weight:600;cursor:pointer}</style><div class="card"><h1>Conexão LinkedIn</h1><p>${safeMessage}</p><button onclick="window.close()">Concluir</button></div><script>window.opener?.postMessage(${payload},${JSON.stringify(origin)});setTimeout(()=>window.close(),900)</script></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const session = await getAdminSession();
  if (!session) return popupResponse(origin, "rc:linkedin-error", "Sua sessão expirou. Entre novamente e tente conectar.", undefined, 401);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) return popupResponse(origin, "rc:linkedin-error", "A autorização não pôde ser validada. Tente novamente.", undefined, 400);

  const config = linkedInOAuthConfig();
  if (!config) return popupResponse(origin, "rc:linkedin-unavailable", "A conexão LinkedIn ainda não foi ativada neste ambiente.", undefined, 503);
  const redirectUri = process.env.LINKEDIN_OAUTH_REDIRECT_URI?.trim() || `${origin}/api/admin/network/linkedin/callback`;
  try {
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri }), cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("TOKEN_EXCHANGE_FAILED");
    const token = TokenSchema.parse(await tokenResponse.json());
    const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    if (!userResponse.ok) throw new Error("USERINFO_FAILED");
    const user = UserSchema.parse(await userResponse.json());

    const contacts: LinkedInContact[] = [];
    if (linkedInConnectionsEnabled()) {
      for (let start = 0; start < 5000; start += 50) {
        const connectionsUrl = new URL("https://api.linkedin.com/v2/connections");
        connectionsUrl.searchParams.set("q", "viewer");
        connectionsUrl.searchParams.set("start", String(start));
        connectionsUrl.searchParams.set("count", "50");
        connectionsUrl.searchParams.set("projection", "(elements(*(to~)),paging)");
        const response = await fetch(connectionsUrl, { headers: { Authorization: `Bearer ${token.access_token}`, "X-Restli-Protocol-Version": "2.0.0" }, cache: "no-store" });
        if (!response.ok) throw new Error("CONNECTIONS_API_FAILED");
        const parsed = parseLinkedInConnections(await response.json());
        contacts.push(...parsed.contacts);
        if (start + 50 >= parsed.total || parsed.contacts.length === 0) break;
      }
    }

    const count = await replaceLinkedInAdminNetworkContacts(session.administratorId, { accountId: user.sub ?? null, accountEmail: user.email ?? null, scopes: token.scope?.split(" ").filter(Boolean) ?? [], contacts });
    const jobs = await listJobs();
    await Promise.all(jobs.filter(job => job.status === "open").map(job => refreshAdminRecommendations(job.id).catch(() => 0)));
    const message = linkedInConnectionsEnabled() ? `${count} conexões sincronizadas com sucesso.` : "Conta conectada. A sincronização da rede será ativada após a aprovação do LinkedIn.";
    return popupResponse(origin, "rc:linkedin-connected", message, count);
  } catch {
    return popupResponse(origin, "rc:linkedin-error", "Não foi possível concluir a conexão com o LinkedIn. Tente novamente.", undefined, 502);
  }
}
