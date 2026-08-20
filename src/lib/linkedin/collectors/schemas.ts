import { z } from "zod";

export const LINKEDIN_SELECTOR_VERSION = "2026-08-20.1";

export const observedFieldSchema = <T extends z.ZodType>(value: T) => z.object({
  value: value.nullable(),
  sourceUrl: z.string().url(),
  observedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
});

export type ObservedField<T> = {
  value: T | null;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
};

const partialDate = z.string().regex(/^\d{4}(?:-(0[1-9]|1[0-2]))?$/).nullable();
export const roleSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  startDate: partialDate,
  endDate: partialDate,
});
export const educationSchema = z.object({
  school: z.string().nullable(),
  degree: z.string().nullable(),
  startDate: partialDate,
  endDate: partialDate,
});
export const certificationSchema = z.object({
  name: z.string().nullable(),
  issuer: z.string().nullable(),
  issuedDate: partialDate,
});
export const projectSchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
});

const stringField = observedFieldSchema(z.string());
export const inventoryEntrySchema = z.object({
  selectorVersion: z.literal(LINKEDIN_SELECTOR_VERSION),
  profileUrl: stringField,
  name: stringField,
  headline: stringField,
  photoUrl: stringField,
  location: stringField,
  connectionDegree: stringField,
});

export const professionalProfileSchema = z.object({
  selectorVersion: z.literal(LINKEDIN_SELECTOR_VERSION),
  profileUrl: stringField,
  name: stringField,
  headline: stringField,
  location: stringField,
  summary: stringField,
  roles: observedFieldSchema(z.array(roleSchema)),
  education: observedFieldSchema(z.array(educationSchema)),
  skills: observedFieldSchema(z.array(z.string())),
  certifications: observedFieldSchema(z.array(certificationSchema)),
  languages: observedFieldSchema(z.array(z.string())),
  projects: observedFieldSchema(z.array(projectSchema)),
  internationalExperience: observedFieldSchema(z.array(z.string())),
  mutualConnections: observedFieldSchema(z.number().int().nonnegative()),
});

export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
export type RawInventoryEntry = Partial<{
  name: string;
  headline: string;
  url: string;
  photoUrl: string;
  location: string;
  connectionDegree: string;
  fallback: boolean;
}>;
export type RawProfessionalProfile = Partial<{
  name: string;
  headline: string;
  location: string;
  summary: string;
  roles: Array<z.infer<typeof roleSchema>>;
  education: Array<z.infer<typeof educationSchema>>;
  skills: string[];
  certifications: Array<z.infer<typeof certificationSchema>>;
  languages: string[];
  projects: Array<z.infer<typeof projectSchema>>;
  internationalExperience: string[];
  mutualConnections: number;
  fallbackFields: string[];
}>;
