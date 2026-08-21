import { z } from "zod";

// Contrato do que a extensão devolve por conexão (nome, headline e URL pública).
export interface LinkedInConnectionRaw {
  name: string;
  headline: string;
  profileUrl: string;
  connectedOn?: string;
}

const LinkedInConnectionSchema = z.object({
  name: z.string(),
  headline: z.string(),
  profileUrl: z.string(),
  connectedOn: z.string().optional(),
});

export function parseLinkedInExport(data: unknown): LinkedInConnectionRaw[] {
  return z.array(LinkedInConnectionSchema).parse(data);
}
