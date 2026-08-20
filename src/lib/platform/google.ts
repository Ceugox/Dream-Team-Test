import { z } from "zod";

const PersonSchema = z.object({
  resourceName: z.string().optional(),
  names: z.array(z.object({ displayName: z.string().optional() })).optional(),
  emailAddresses: z.array(z.object({ value: z.string().optional() })).optional(),
  phoneNumbers: z.array(z.object({ canonicalForm: z.string().optional(), value: z.string().optional() })).optional(),
  organizations: z.array(z.object({ name: z.string().optional(), title: z.string().optional(), current: z.boolean().optional() })).optional(),
});

const PeopleResponseSchema = z.object({
  connections: z.array(PersonSchema).optional(),
  nextPageToken: z.string().optional(),
  totalPeople: z.number().optional(),
});

export type GoogleContact = {
  name: string;
  headline: string | null;
  phone: string | null;
  profileContext: string | null;
};

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function buildGoogleAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/contacts.readonly",
    ].join(" "),
  }).toString();
  return url.toString();
}

export function parseGooglePeopleResponse(value: unknown): { contacts: GoogleContact[]; nextPageToken: string | null } {
  const response = PeopleResponseSchema.parse(value);
  const seen = new Set<string>();
  const contacts: GoogleContact[] = [];
  for (const person of response.connections ?? []) {
    const name = person.names?.find(item => item.displayName?.trim())?.displayName?.trim();
    if (!name) continue;
    const email = person.emailAddresses?.find(item => item.value?.trim())?.value?.trim().toLowerCase() ?? null;
    const identity = email || person.resourceName || name.toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    const organization = person.organizations?.find(item => item.current) ?? person.organizations?.[0];
    const headline = [organization?.title, organization?.name].filter(Boolean).join(" · ") || null;
    const phone = person.phoneNumbers?.find(item => item.canonicalForm || item.value);
    contacts.push({
      name,
      headline,
      phone: phone?.canonicalForm || phone?.value || null,
      profileContext: email ? `Google Contacts · ${email}` : "Google Contacts",
    });
  }
  return { contacts, nextPageToken: response.nextPageToken ?? null };
}

