import { z } from "zod";
import { actorToOwner, mapLinkedInServiceError, secureJson } from "@/lib/linkedin/api";
import { getLinkedInSyncService } from "@/lib/linkedin/runtime";
import { enqueueLinkedInSyncWorkflow } from "@/lib/orchestration/orchestrator";
import { getAuthenticatedActor } from "@/lib/platform/auth";

export const runtime = "nodejs";

const CreateSessionBody = z.object({ consent: z.literal(true) });

export async function POST(request: Request) {
  const actor = await getAuthenticatedActor();
  if (!actor) return secureJson({ error: "unauthorized" }, 401);
  const body = CreateSessionBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return secureJson({ error: "consent_required" }, 400);
  const owner = actorToOwner(actor);
  try {
    const service = getLinkedInSyncService();
    const created = await service.createInteractiveSession(owner, { consent: body.data.consent });
    try {
      await enqueueLinkedInSyncWorkflow(created.session.id, owner);
    } catch (error) {
      await service.cancelOwnedSession(owner, created.session.id).catch(() => null);
      throw error;
    }
    return secureJson({
      session: created.session,
      interactiveUrl: created.interactiveUrl,
      expiresAt: created.session.expiresAt,
    }, 201);
  } catch (error) {
    return mapLinkedInServiceError(error);
  }
}
