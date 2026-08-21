/** Corpo do create-evaluator-invites.mjs — roda via tsx com DATABASE_URL/APP_SECRET no env. */
import { createInvitation } from "../src/lib/platform/repository";

const count = Math.max(1, Math.min(Number(process.env.INVITE_COUNT) || 3, 10));
const appUrl = process.env.INVITE_APP_URL;
if (!appUrl) throw new Error("INVITE_APP_URL é obrigatória");

for (let i = 0; i < count; i++) {
  const invitation = await createInvitation();
  console.log(`Avaliador ${i + 1}: ${appUrl}/join/${invitation.token}`);
}
process.exit(0);
