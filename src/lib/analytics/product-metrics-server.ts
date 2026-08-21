import "server-only";

import type { ProductMetricEventName } from "@/lib/analytics/product-metrics";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export type ProductMetricAggregate = {
  eventName: ProductMetricEventName;
  eventCount: number;
  durationTotalMs: number;
  durationSampleCount: number;
};

function safeCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function recordProductMetricServer(
  eventName: ProductMetricEventName,
  durationMs?: number,
) {
  // Local builds, tests and preview deployments must never pollute production metrics.
  if (process.env.VERCEL_ENV !== "production") return false;

  try {
    const { error } = await createAppV2AdminClient().rpc("record_product_metric_v1", {
      p_event_name: eventName,
      p_duration_ms: durationMs === undefined ? null : Math.round(durationMs / 250) * 250,
    });

    if (error) {
      console.error("[product-metrics] Increment failed:", { eventName, code: error.code });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[product-metrics] Increment unavailable:", {
      eventName,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

export async function getProductMetricSummary(days = 30): Promise<ProductMetricAggregate[]> {
  const boundedDays = Math.max(1, Math.min(Math.round(days), 90));
  const { data, error } = await createAppV2AdminClient().rpc("get_product_metrics_summary_v1", {
    p_days: boundedDays,
  });

  if (error) {
    console.error("[product-metrics] Summary failed:", { code: error.code });
    throw new Error("Driftstallene kunne ikke indlæses.");
  }

  if (!Array.isArray(data)) return [];

  return data.flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.event_name !== "string") return [];

    return [{
      eventName: row.event_name as ProductMetricEventName,
      eventCount: safeCount(row.event_count),
      durationTotalMs: safeCount(row.duration_total_ms),
      durationSampleCount: safeCount(row.duration_sample_count),
    }];
  });
}
