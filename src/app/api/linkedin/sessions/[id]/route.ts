import { actorToOwner, secureJson } from "@/lib/linkedin/api";
import { findOwnedSession } from "@/lib/linkedin/sessionRepository";
import { toPublicSession } from "@/lib/linkedin/sessionState";
import { getAuthenticatedActor } from "@/lib/platform/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedActor();
  if (!actor) return secureJson({ error: "unauthorized" }, 401);
  const { id } = await params;
  const session = await findOwnedSession(actorToOwner(actor), id);
  if (!session) return secureJson({ error: "not_found" }, 404);
  return secureJson({ session: toPublicSession(session) });
}
