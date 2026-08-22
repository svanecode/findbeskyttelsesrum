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
const privacyOperationsMigrationUrl = new URL(
  "../supabase/migrations/20260822052837_release_3_privacy_operations.sql",
  import.meta.url,
);
const heartbeatMonitorUrl = new URL("../scripts/monitor/record-trusted-heartbeat.mjs", import.meta.url);
const smokeWorkflowUrl = new URL("../.github/workflows/production-smoke.yml", import.meta.url);
const operationalHealthUrl = new URL("../src/lib/operations/operational-health.ts", import.meta.url);

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
  assert.equal(parseProductMetricPayload({ eventName: "monitor_heartbeat" }), null);
  assert.equal(parseProductMetricPayload({ eventName: "nearby_results_loaded", durationMs: 120_001 }), null);
  assert.equal(new Set(productMetricEventNames).size, productMetricEventNames.length);
});

test("trusted operational health is separate from browser product metrics", async () => {
  const [migration, heartbeatMonitor, smokeWorkflow, client, operationalHealth] = await Promise.all([
    readFile(privacyOperationsMigrationUrl, "utf8"),
    readFile(heartbeatMonitorUrl, "utf8"),
    readFile(smokeWorkflowUrl, "utf8"),
    readFile(clientUrl, "utf8"),
    readFile(operationalHealthUrl, "utf8"),
  ]);
  const lowerSql = migration.toLowerCase();

  assert.match(lowerSql, /create table app_v2\.operational_heartbeats/);
  assert.match(lowerSql, /alter table app_v2\.operational_heartbeats enable row level security/);
  assert.match(lowerSql, /revoke all on table app_v2\.operational_heartbeats from public, anon, authenticated/);
  assert.match(lowerSql, /record_operational_heartbeat_v1/);
  assert.match(lowerSql, /get_operational_health_v1/);
  assert.match(lowerSql, /delete from app_v2\.product_metrics_hourly\s+where event_name = 'monitor_heartbeat'/);
  assert.doesNotMatch(client, /monitor_heartbeat/);
  assert.match(heartbeatMonitor, /SUPABASE_SECRET_KEY/);
  assert.match(heartbeatMonitor, /record_operational_heartbeat_v1/);
  assert.match(smokeWorkflow, /Registrér betroet driftsheartbeat/);
  assert.match(smokeWorkflow, /SMOKE_ALLOW_STALE_OPERATIONAL_HEARTBEAT/);
  assert.match(operationalHealth, /typeof value !== "number" && typeof value !== "string"/);
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
  assert.match(route, /consumeDistributedRateLimit/);
  assert.match(route, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
  assert.match(client, /credentials: "omit"/);
  assert.match(client, /keepalive: true/);
  assert.match(monitor, /"Content-Profile": "app_v2"/);
});
