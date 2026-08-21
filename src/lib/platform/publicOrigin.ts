function validOrigin(value: string | undefined, defaultProtocol = "https:"): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate.includes("://") ? candidate : `${defaultProtocol}//${candidate}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function resolvePublicOrigin(request: Request, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = validOrigin(env.APP_URL) || validOrigin(env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;

  const railway = validOrigin(env.RAILWAY_PUBLIC_DOMAIN);
  if (railway) return railway;

  // Em produção o host informado pelo proxy não é confiável: um Host forjado viraria
  // link de convite apontando para o domínio do atacante. Melhor falhar alto.
  if (env.NODE_ENV === "production") throw new Error("APP_URL or RAILWAY_PUBLIC_DOMAIN is required in production");

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) {
    const forwarded = validOrigin(host, forwardedProtocol === "http" ? "http:" : "https:");
    if (forwarded) return forwarded;
  }

  return new URL(request.url).origin;
}
