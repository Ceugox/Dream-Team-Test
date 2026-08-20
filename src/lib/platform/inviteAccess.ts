export function extractInviteToken(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  let candidate = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      candidate = new URL(value).pathname;
    } catch {
      return null;
    }
  }

  const joinMarker = "/join/";
  const markerIndex = candidate.toLowerCase().lastIndexOf(joinMarker);
  if (markerIndex >= 0) candidate = candidate.slice(markerIndex + joinMarker.length);

  candidate = candidate.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9_-]{20,128}$/.test(candidate) ? candidate : null;
}
