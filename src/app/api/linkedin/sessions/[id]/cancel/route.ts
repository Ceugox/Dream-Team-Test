import { actorToOwner, mapLinkedInServiceError, secureJson } from "@/lib/linkedin/api";
import { getLinkedInSyncService } from "@/lib/linkedin/runtime";
import { cancelLinkedInWorkflowBySession } from "@/lib/orchestration/orchestrator";
import { getAuthenticatedActor } from "@/lib/platform/auth";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedActor();
  if (!actor) return secureJson({ error: "unauthorized" }, 401);
  const { id } = await params;
  try {
    const session = await getLinkedInSyncService().cancelOwnedSession(actorToOwner(actor), id);
    if (!session) return secureJson({ error: "not_found" }, 404);
    await cancelLinkedInWorkflowBySession(id, "cancelled_by_owner").catch(() => 0);
    return secureJson({ session });
  } catch (error) {
    return mapLinkedInServiceError(error);
  }
}
