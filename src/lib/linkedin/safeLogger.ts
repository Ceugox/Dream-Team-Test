const SENSITIVE_KEY_PATTERN = /(token|cookie|authorization|password|secret|credential|provider[_-]?session[_-]?reference|referer)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /wss?:\/\/\S+/gi,
  /\btoken=[^\s&"']+/gi,
  /\bBearer\s+\S+/gi,
  /\benc:v1:\S+/gi,
  /\bli_at=[^\s;"']+/gi,
];

function sanitizeString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (value instanceof Error) return sanitizeString(value.message);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeForLog(nested);
    }
    return result;
  }
  return value;
}

export type SafeLogSink = (line: string) => void;

export function createSafeLogger(sink: SafeLogSink = (line) => console.log(line)) {
  const emit = (level: "info" | "error", event: string, fields: Record<string, unknown> = {}) => {
    sink(JSON.stringify({ ...sanitizeForLog(fields) as Record<string, unknown>, event, level }));
  };
  return {
    info: (event: string, fields: Record<string, unknown> = {}) => emit("info", event, fields),
    error: (event: string, fields: Record<string, unknown> = {}) => emit("error", event, fields),
  };
}
