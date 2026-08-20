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

function isLoopbackOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolvePublicOrigin(request: Request, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = validOrigin(env.APP_URL) || validOrigin(env.NEXT_PUBLIC_APP_URL);
  const railway = validOrigin(env.RAILWAY_PUBLIC_DOMAIN);

  if (configured && (!railway || !isLoopbackOrigin(configured))) return configured;
  if (railway) return railway;
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) {
    const forwarded = validOrigin(host, forwardedProtocol === "http" ? "http:" : "https:");
    if (forwarded) return forwarded;
  }

  return new URL(request.url).origin;
}
