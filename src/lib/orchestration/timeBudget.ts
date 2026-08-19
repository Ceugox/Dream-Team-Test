export const TIME_BUDGET_MS = 290_000;

export type Phase = "bootstrap" | "discovery" | "enrichment" | "relationship" | "jobEnrichment" | "ranking" | "finalizing";

export class TimeBudget {
  private startedAt: number;
  private totalMs: number;
  private clock: () => number;

  constructor(totalMs: number = TIME_BUDGET_MS, clock: () => number = () => Date.now()) {
    this.totalMs = totalMs;
    this.clock = clock;
    this.startedAt = clock();
  }

  elapsedMs(): number {
    return this.clock() - this.startedAt;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }

  isExpired(): boolean {
    return this.elapsedMs() >= this.totalMs;
  }

  phase(): Phase {
    const ratio = this.elapsedMs() / this.totalMs;
    if (ratio < 10 / 290) return "bootstrap";
    if (ratio < 60 / 290) return "discovery";
    if (ratio < 120 / 290) return "enrichment";
    if (ratio < 180 / 290) return "relationship";
    if (ratio < 240 / 290) return "jobEnrichment";
    if (ratio < 280 / 290) return "ranking";
    return "finalizing";
  }
}
