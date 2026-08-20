import type { JobStatus } from "./types";

export const jobStatuses: JobStatus[] = ["draft", "open", "screening", "interviewing", "offer", "filled", "paused", "cancelled"];

const transitions: Record<JobStatus, JobStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["screening", "paused", "cancelled"],
  screening: ["open", "interviewing", "paused", "cancelled"],
  interviewing: ["screening", "offer", "paused", "cancelled"],
  offer: ["interviewing", "filled", "paused", "cancelled"],
  paused: ["open", "screening", "interviewing", "offer", "cancelled"],
  filled: [],
  cancelled: [],
};

const labels: Record<JobStatus, string> = {
  draft: "Rascunho", open: "Aberta", screening: "Triagem", interviewing: "Entrevistas",
  offer: "Oferta", filled: "Preenchida", paused: "Pausada", cancelled: "Cancelada",
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function jobStatusLabel(status: JobStatus): string { return labels[status]; }
