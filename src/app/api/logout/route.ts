import { NextResponse } from "next/server";
import { clearSessions, getAdminSession } from "@/lib/platform/auth";
import { resolvePublicOrigin } from "@/lib/platform/publicOrigin";

export async function POST(request: Request) {
  // Quem é admin volta para o login administrativo; o membro volta para a escolha de acesso,
  // que é a tela para onde o layout dele redireciona quando não há sessão.
  const destination = (await getAdminSession()) ? "/admin/login" : "/";
  await clearSessions();
  // Behind the proxy request.url carries the internal container host, which the browser cannot resolve.
  return NextResponse.redirect(new URL(destination, resolvePublicOrigin(request)), 303);
}
