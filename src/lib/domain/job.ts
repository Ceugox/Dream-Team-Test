import { z } from "zod";

export const JobProfileSchema = z.object({
  title: z.string(),
  company: z.string().nullable().default(null),
  description: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  seniority: z.enum(["junior", "pleno", "senior", "staff", "unknown"]).default("unknown"),
  location: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
});
export type JobProfile = z.infer<typeof JobProfileSchema>;
