import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminSession } from "@/lib/platform/auth";
import { googleOAuthConfig, parseGooglePeopleResponse, type GoogleContact } from "@/lib/platform/google";
import { listJobs, refreshAdminRecommendations, replaceGoogleAdminNetworkContacts } from "@/lib/platform/repository";

const STATE_COOKIE = "rc_google_oauth_state";
const TokenSchema = z.object({ access_token: z.string().min(1), scope: z.string().optional() });
const UserSchema = z.object({ sub: z.string().optional(), email: z.string().email().optional() });

function popupResponse(origin: string, type: string, message: string, count?: number, status = 200) {
  const payload = JSON.stringify({ type, message, count }).replaceAll("<", "\\u003c");
  const safeMessage = message.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!);
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexão Google</title><style>body{margin:0;background:#0b0d12;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:420px;border:1px solid #343949;border-radius:20px;background:#141720;padding:24px}p{color:#aeb4c0;line-height:1.6}button{min-height:48px;border:0;border-radius:12px;padding:0 18px;font-weight:600;cursor:pointer}</style><div class="card"><h1>Conexão Google</h1><p>${safeMessage}</p><button onclick="window.close()">Concluir</button></div><script>window.opener?.postMessage(${payload},${JSON.stringify(origin)});setTimeout(()=>window.close(),900)</script></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const session = await getAdminSession();
  if (!session) return popupResponse(origin, "rc:google-error", "Sua sessão expirou. Entre novamente e tente conectar.", undefined, 401);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) return popupResponse(origin, "rc:google-error", "A autorização não pôde ser validada. Tente novamente.", undefined, 400);

  const config = googleOAuthConfig();
  if (!config) return popupResponse(origin, "rc:google-unavailable", "A conexão Google ainda não foi ativada neste ambiente.", undefined, 503);
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || `${origin}/api/admin/network/google/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("TOKEN_EXCHANGE_FAILED");
    const token = TokenSchema.parse(await tokenResponse.json());

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const user = userResponse.ok ? UserSchema.parse(await userResponse.json()) : {};

    const contacts: GoogleContact[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < 5; page++) {
      const peopleUrl = new URL("https://people.googleapis.com/v1/people/me/connections");
      peopleUrl.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations");
      peopleUrl.searchParams.set("pageSize", "1000");
      if (pageToken) peopleUrl.searchParams.set("pageToken", pageToken);
      const peopleResponse = await fetch(peopleUrl, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
      if (!peopleResponse.ok) throw new Error("PEOPLE_API_FAILED");
      const parsed = parseGooglePeopleResponse(await peopleResponse.json());
      contacts.push(...parsed.contacts);
      pageToken = parsed.nextPageToken;
      if (!pageToken) break;
    }

    const count = await replaceGoogleAdminNetworkContacts(session.administratorId, {
      accountId: user.sub ?? null,
      accountEmail: user.email ?? null,
      scopes: token.scope?.split(" ").filter(Boolean) ?? [],
      contacts,
    });
    const jobs = await listJobs();
    await Promise.all(jobs.filter(job => job.status === "open").map(job => refreshAdminRecommendations(job.id).catch(() => 0)));
    return popupResponse(origin, "rc:google-connected", `${count} contatos conectados com sucesso.`, count);
  } catch {
    return popupResponse(origin, "rc:google-error", "O Google autorizou a conta, mas não foi possível concluir a importação. Tente novamente.", undefined, 502);
  }
}
