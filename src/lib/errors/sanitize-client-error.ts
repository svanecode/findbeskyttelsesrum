const maximumMessageLength = 2_000;
const maximumStackLength = 6_000;
const maximumStackLines = 20;
const maximumUrlLength = 2_048;
const maximumContextValueLength = 1_000;

const allowedReportKeys = new Set(["message", "stack", "url", "timestamp", "context"]);
const allowedContextKeys = new Set(["component", "errorInfo", "type", "filename", "lineno", "colno"]);
const labelledCoordinatePattern = /\b(lat(?:itude)?|lng|lon(?:gitude)?)\s*[:=]\s*-?\d{1,3}(?:[.,]\d+)?/gi;
const danishCoordinatePairPattern = /\b5[4-8](?:\.\d{2,})\s*[,;/|]\s*(?:[7-9]|1[0-6])(?:\.\d{2,})\b/g;
const danishAddressPattern = /\b[\p{L}][\p{L} .'-]{1,48}(?:vej|gade|all[ée]|boulevard|plads|stræde|torv|vænget|parken|bakken|engen|holmen)\s+\d{1,4}[a-z]?(?:(?:,|\s)\s*\d{4}\s+[\p{L}][\p{L} .'-]{1,40})?/giu;
const embeddedUrlPattern = /https?:\/\/[^\s"'<>]+/gi;

export type SanitizedClientErrorReport = {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  context?: Record<string, unknown>;
};

function truncate(value: string, maximumLength: number) {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength)}…[truncated]`;
}

export function stripUrlQuery(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

export function redactPotentialLocationData(value: string) {
  return value
    .replace(embeddedUrlPattern, (url) => stripUrlQuery(url))
    .replace(labelledCoordinatePattern, "$1=[location redacted]")
    .replace(danishCoordinatePairPattern, "[coordinates redacted]")
    .replace(danishAddressPattern, "[address redacted]");
}

function sanitizeContext(context: unknown) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!allowedContextKeys.has(key)) continue;
    if (typeof value === "string") {
      const locationSafeValue = key === "filename"
        ? stripUrlQuery(value)
        : redactPotentialLocationData(value);
      sanitized[key] = truncate(locationSafeValue, maximumContextValueLength);
    } else if (
      (key === "lineno" || key === "colno")
      && typeof value === "number"
      && Number.isSafeInteger(value)
      && value >= 0
      && value <= 10_000_000
    ) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeStack(value: unknown) {
  if (value === undefined) return undefined;
  const lines = String(value)
    .split(/\r?\n/)
    .slice(0, maximumStackLines)
    .map(redactPotentialLocationData);
  return truncate(lines.join("\n"), maximumStackLength);
}

function validTimestamp(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now + 5 * 60_000 || timestamp < now - 24 * 60 * 60_000) return null;
  return new Date(timestamp).toISOString();
}

export function parseAndSanitizeClientErrorReport(
  value: unknown,
  now = Date.now(),
): SanitizedClientErrorReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.some((key) => !allowedReportKeys.has(key))) return null;
  if (typeof raw.message !== "string" || raw.message.trim() === "") return null;

  const timestamp = validTimestamp(raw.timestamp, now);
  if (!timestamp) return null;

  const stack = sanitizeStack(raw.stack);
  const url = typeof raw.url === "string" ? stripUrlQuery(raw.url) : "";
  return {
    message: truncate(redactPotentialLocationData(raw.message.trim()), maximumMessageLength),
    ...(stack ? { stack } : {}),
    url: truncate(url, maximumUrlLength),
    timestamp,
    context: sanitizeContext(raw.context),
  };
}
