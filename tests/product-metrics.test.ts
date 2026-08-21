import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseProductMetricPayload,
  productMetricEventNames,
} from "../src/lib/analytics/product-metrics";

const migrationUrl = new URL(
  "../supabase/migrations/20260821171911_free_release_observability.sql",
  import.meta.url,
);
const routeUrl = new URL("../src/app/api/metrics/route.ts", import.meta.url);
const clientUrl = new URL("../src/lib/analytics/product-metrics.ts", import.meta.url);
const monitorUrl = new URL("../scripts/monitor/product-metrics-health.mjs", import.meta.url);

test("product metric payloads accept only a fixed privacy-safe contract", () => {
  assert.deepEqual(parseProductMetricPayload({ eventName: "address_selected" }), {
    eventName: "address_selected",
  });
  assert.deepEqual(parseProductMetricPayload({ eventName: "nearby_results_loaded", durationMs: 1126 }), {
    eventName: "nearby_results_loaded",
    durationMs: 1250,
  });

  for (const privateField of ["address", "latitude", "longitude", "url", "userId", "ip"]) {
    assert.equal(parseProductMetricPayload({ eventName: "address_selected", [privateField]: "private" }), null);
  }
  assert.equal(parseProductMetricPayload({ eventName: "unknown" }), null);
  assert.equal(parseProductMetricPayload({ eventName: "nearby_results_loaded", durationMs: 120_001 }), null);
  assert.equal(new Set(productMetricEventNames).size, productMetricEventNames.length);
});

test("metrics stay private, aggregated and service-only", async () => {
  const [migration, route, client, monitor] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(clientUrl, "utf8"),
    readFile(monitorUrl, "utf8"),
  ]);
  const lowerSql = migration.toLowerCase();

  assert.match(lowerSql, /create table if not exists app_v2\.product_metrics_hourly/);
  assert.match(lowerSql, /primary key \(metric_hour, event_name\)/);
  assert.match(lowerSql, /metric_hour < date_trunc\('day', now\(\)\) - interval '90 days'/);
  assert.match(lowerSql, /alter table app_v2\.product_metrics_hourly enable row level security/);
  assert.match(lowerSql, /revoke all on table app_v2\.product_metrics_hourly from public, anon, authenticated/);
  assert.match(lowerSql, /grant execute on function app_v2\.record_product_metric_v1\(text, integer\) to service_role/);
  assert.doesNotMatch(lowerSql, /grant execute on function app_v2\.record_product_metric_v1[^;]+to (anon|authenticated)/);
  assert.doesNotMatch(lowerSql, /\b(ip_address|user_id|latitude|longitude|address|url)\s+(text|uuid|numeric|double)/);
  assert.match(route, /maximumBodyLength = 256/);
  assert.match(route, /isSameOrigin/);
  assert.match(client, /credentials: "omit"/);
  assert.match(client, /keepalive: true/);
  assert.match(monitor, /"Content-Profile": "app_v2"/);
});
