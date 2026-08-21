export type RateLimitBucket = Map<string, number[]>;

export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number };

// Janela deslizante em memória: suficiente para conter força bruta contra a chave de admin
// numa instância única. Não sobrevive a restart nem se propaga entre réplicas, de propósito —
// é contenção, não contabilidade.
export function checkRateLimit(bucket: RateLimitBucket, key: string, options: { now: number; limit: number; windowMs: number }): RateLimitDecision {
  const { now, limit, windowMs } = options;
  const cutoff = now - windowMs;
  const hits = (bucket.get(key) ?? []).filter(timestamp => timestamp > cutoff);

  if (hits.length >= limit) {
    bucket.set(key, hits);
    const oldest = hits[0];
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  hits.push(now);
  bucket.set(key, hits);
  // Oportunista: sem isto, um atacante rotacionando IPs faria o mapa crescer sem limite.
  if (bucket.size > 5000) for (const [entry, timestamps] of bucket) if (!timestamps.some(timestamp => timestamp > cutoff)) bucket.delete(entry);
  return { allowed: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
