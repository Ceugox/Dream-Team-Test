import { z } from "zod";

const ConnectionSchema = z.object({
  "to~": z.object({
    id: z.string().optional(),
    localizedFirstName: z.string().optional(),
    localizedLastName: z.string().optional(),
    localizedHeadline: z.string().optional(),
  }).optional(),
});

const ConnectionsResponseSchema = z.object({
  elements: z.array(ConnectionSchema).optional(),
  paging: z.object({ total: z.number().optional(), start: z.number().optional(), count: z.number().optional() }).optional(),
});

export type LinkedInContact = { name: string; headline: string | null; phone: null; profileContext: string };

export function linkedInOAuthConfig() {
  const clientId = process.env.LINKEDIN_OAUTH_CLIENT_ID?.trim() || process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_OAUTH_CLIENT_SECRET?.trim() || process.env.LINKEDIN_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function linkedInConnectionsEnabled(): boolean {
  return process.env.LINKEDIN_CONNECTIONS_SCOPE_ENABLED?.trim().toLowerCase() === "true";
}

export function buildLinkedInAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; includeConnections: boolean }): string {
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  const scopes = ["openid", "profile", "email"];
  if (input.includeConnections) scopes.push("r_1st_connections");
  url.search = new URLSearchParams({ response_type: "code", client_id: input.clientId, redirect_uri: input.redirectUri, state: input.state, scope: scopes.join(" ") }).toString();
  return url.toString();
}

export function parseLinkedInConnections(value: unknown): { contacts: LinkedInContact[]; total: number } {
  const response = ConnectionsResponseSchema.parse(value);
  const contacts: LinkedInContact[] = (response.elements ?? []).flatMap(element => {
    const person = element["to~"];
    const name = [person?.localizedFirstName, person?.localizedLastName].filter(Boolean).join(" ").trim();
    if (!name) return [];
    return [{ name, headline: person?.localizedHeadline?.trim() || null, phone: null, profileContext: "Conexão de 1º grau no LinkedIn" }];
  });
  return { contacts, total: response.paging?.total ?? contacts.length };
}
