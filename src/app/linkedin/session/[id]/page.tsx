import { notFound, redirect } from "next/navigation";
import { actorToOwner } from "@/lib/linkedin/api";
import { findOwnedSession } from "@/lib/linkedin/sessionRepository";
import { toPublicSession } from "@/lib/linkedin/sessionState";
import { getAuthenticatedActor } from "@/lib/platform/auth";
import { LinkedInSessionClient } from "./LinkedInSessionClient";

export const dynamic = "force-dynamic";

export default async function LinkedInSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedActor();
  if (!actor) redirect("/");
  const { id } = await params;
  if (id === "preparing") {
    return <LinkedInSessionClient sessionId={null} initialSession={null} homePath={actor.role === "admin" ? "/admin/rede" : "/app/conexoes"} />;
  }
  const session = await findOwnedSession(actorToOwner(actor), id);
  if (!session) notFound();
  const publicSession = toPublicSession(session);
  return (
    <LinkedInSessionClient
      sessionId={id}
      homePath={actor.role === "admin" ? "/admin/rede" : "/app/conexoes"}
      initialSession={{
        id: publicSession.id,
        status: publicSession.status,
        inventoryCount: publicSession.inventoryCount,
        enrichedCount: publicSession.enrichedCount,
        failedCount: publicSession.failedCount,
        expiresAt: publicSession.expiresAt.toISOString(),
        failureCode: publicSession.failureCode,
        failureMessageSafe: publicSession.failureMessageSafe,
      }}
    />
  );
}
