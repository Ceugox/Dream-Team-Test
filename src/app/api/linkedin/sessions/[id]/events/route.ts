import { actorToOwner, secureJson, SSE_HEADERS, TERMINAL_SESSION_STATUSES } from "@/lib/linkedin/api";
import { findOwnedSession } from "@/lib/linkedin/sessionRepository";
import { toPublicSession } from "@/lib/linkedin/sessionState";
import { getAuthenticatedActor } from "@/lib/platform/auth";
import type { LinkedInSession } from "@/lib/linkedin/types";

export const runtime = "nodejs";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedActor();
  if (!actor) return secureJson({ error: "unauthorized" }, 401);
  const { id } = await params;
  const owner = actorToOwner(actor);
  const initial = await findOwnedSession(owner, id);
  if (!initial) return secureJson({ error: "not_found" }, 404);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let aborted = request.signal.aborted;
      request.signal.addEventListener("abort", () => { aborted = true; });
      let lastPayload = "";
      let lastActivity = Date.now();
      const send = (session: LinkedInSession) => {
        const payload = JSON.stringify(toPublicSession(session));
        if (payload === lastPayload) return;
        lastPayload = payload;
        lastActivity = Date.now();
        controller.enqueue(encoder.encode(`event: session\ndata: ${payload}\n\n`));
      };
      try {
        let current = initial;
        send(current);
        while (!aborted && !TERMINAL_SESSION_STATUSES.includes(current.status)) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (aborted) break;
          const next = await findOwnedSession(owner, id);
          if (!next) break;
          current = next;
          send(current);
          if (Date.now() - lastActivity >= HEARTBEAT_MS) {
            lastActivity = Date.now();
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        }
      } finally {
        try { controller.close(); } catch { /* já fechado pelo cliente */ }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
