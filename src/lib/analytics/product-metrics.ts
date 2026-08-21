export const productMetricEventNames = [
  "address_search_started",
  "address_search_error",
  "address_selected",
  "geolocation_requested",
  "geolocation_succeeded",
  "geolocation_denied",
  "geolocation_error",
  "nearby_results_loaded",
  "nearby_no_results",
  "nearby_error",
  "map_opened",
  "detail_opened",
  "report_started",
  "report_submitted",
  "report_error",
  "client_error",
  "data_explanation_opened",
  "monitor_heartbeat",
] as const;

export type ProductMetricEventName = (typeof productMetricEventNames)[number];

export type ProductMetricPayload = {
  eventName: ProductMetricEventName;
  durationMs?: number;
};

const productMetricEventNameSet = new Set<string>(productMetricEventNames);
const allowedPayloadKeys = new Set(["eventName", "durationMs"]);

export function isProductMetricEventName(value: unknown): value is ProductMetricEventName {
  return typeof value === "string" && productMetricEventNameSet.has(value);
}

export function parseProductMetricPayload(value: unknown): ProductMetricPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length < 1 || keys.length > 2 || keys.some((key) => !allowedPayloadKeys.has(key))) return null;
  if (!isProductMetricEventName(record.eventName)) return null;

  if (record.durationMs === undefined) return { eventName: record.eventName };
  if (
    typeof record.durationMs !== "number"
    || !Number.isFinite(record.durationMs)
    || record.durationMs < 0
    || record.durationMs > 120_000
  ) {
    return null;
  }

  return {
    eventName: record.eventName,
    durationMs: Math.round(record.durationMs / 250) * 250,
  };
}

export function trackProductMetric(eventName: ProductMetricEventName, durationMs?: number) {
  if (process.env.NODE_ENV !== "production") return;

  const payload = parseProductMetricPayload({ eventName, ...(durationMs === undefined ? {} : { durationMs }) });
  if (!payload) return;

  void fetch("/api/metrics", {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Metrics are deliberately best-effort and must never block a public flow.
  });
}
