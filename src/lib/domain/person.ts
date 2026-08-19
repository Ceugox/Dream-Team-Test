import { z } from "zod";

export const RelationshipDataSchema = z.object({
  emailsSent: z.number().default(0),
  emailsReceived: z.number().default(0),
  meetings: z.number().default(0),
  firstInteraction: z.string().datetime().nullable().default(null),
  lastInteraction: z.string().datetime().nullable().default(null),
  reciprocity: z.number().min(0).max(1).nullable().default(null),
  frequency: z.number().min(0).max(1).nullable().default(null),
  recency: z.number().min(0).max(1).nullable().default(null),
  contactSignal: z.number().min(0).max(1).nullable().default(null),
});
export type RelationshipData = z.infer<typeof RelationshipDataSchema>;

export const ConfidenceDataSchema = z.object({
  identity: z.number().min(0).max(1),
  company: z.number().min(0).max(1).nullable().default(null),
  role: z.number().min(0).max(1).nullable().default(null),
  overall: z.number().min(0).max(1),
});
export type ConfidenceData = z.infer<typeof ConfidenceDataSchema>;

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  linkedinUrl: z.string().nullable().default(null),
  headline: z.string().nullable().default(null),
  currentCompany: z.string().nullable().default(null),
  currentRole: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  previousCompanies: z.array(z.string()).default([]),
  education: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  relationship: RelationshipDataSchema.nullable().default(null),
  confidence: ConfidenceDataSchema.nullable().default(null),
  jobFitScore: z.number().nullable().default(null),
  relationshipScore: z.number().nullable().default(null),
  referralScore: z.number().nullable().default(null),
});
export type Person = z.infer<typeof PersonSchema>;

export function createPerson(partial: Partial<Person> & { id: string }): Person {
  return PersonSchema.parse(partial);
}
