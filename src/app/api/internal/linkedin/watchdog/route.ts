import { timingSafeEqual } from "node:crypto";
import { secureJson } from "@/lib/linkedin/api";
import { getLinkedInSyncService } from "@/lib/linkedin/runtime";
import { findAllExpiredSessions, markFinished } from "@/lib/linkedin/sessionRepository";
import { cancelLinkedInWorkflowBySession } from "@/lib/orchestration/orchestrator";

export const runtime = "nodejs";

function bearerMatches(header: string | null, secret: string): boolean {
  const provided = Buffer.from(header ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return secureJson({ error: "not_configured" }, 503);
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return secureJson({ error: "unauthorized" }, 401);
  }
  let expired = 0;
  const expiredIds: string[] = [];
  try {
    const sessions = await findAllExpiredSessions();
    expiredIds.push(...sessions.map((session) => session.id));
    expired = await getLinkedInSyncService().expireOrphanedSessions();
  } catch {
    // Com a integração desligada não há provider para destruir; ainda assim
    // as sessões órfãs do banco precisam ser expiradas.
    const sessions = await findAllExpiredSessions();
    for (const session of sessions) {
      await markFinished(session.owner, session.id, "expired");
      expiredIds.push(session.id);
    }
    expired = sessions.length;
  }
  for (const sessionId of expiredIds) {
    await cancelLinkedInWorkflowBySession(sessionId, "linkedin_session_expired").catch(() => 0);
  }
  return secureJson({ expired });
}
