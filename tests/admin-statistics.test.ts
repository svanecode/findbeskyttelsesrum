import assert from "node:assert/strict";
import test from "node:test";

import { niceMax } from "../src/components/admin/charts";
import { loadServerModule } from "./support/load-server-module";

type StatisticsModule = typeof import("../src/lib/analytics/admin-statistics");

async function loadStatistics(rpcResult: { data: unknown; error: unknown }) {
  return loadServerModule<StatisticsModule>(new URL("../src/lib/analytics/admin-statistics.ts", import.meta.url), {
    "@/lib/supabase/app-v2": { createAppV2AdminClient: () => ({ rpc: async () => rpcResult }) },
  });
}

test("axis maxima are round and their midpoint is a whole number", () => {
  for (const [value, expected] of [[0, 2], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 20], [26, 40], [230, 400], [460, 500], [4_300, 5_000]] as const) {
    const max = niceMax(value);
    assert.equal(max, expected, `niceMax(${value})`);
    assert.ok(max >= value);
    assert.ok(Number.isInteger(max / 2), `half of ${max} is whole`);
  }
});

test("statistics parsing computes daily averages and drops malformed rows", async () => {
  const statistics = await loadStatistics({
    error: null,
    data: {
      days: 30,
      daily: [
        { day: "2026-09-27", searches: 10, areasChosen: 8, resultsLoaded: 4, loadMsTotal: 6000, loadSamples: 4, errors: "2" },
        { day: "2026-09-28", searches: -5, loadSamples: 0 },
        { day: "not-a-date", searches: 99 },
      ],
      reports: { weekly: [{ week: "2026-09-21", received: 3, closed: 1 }], byType: { other: 2 }, active: 1, medianHoursToClose: 30.5 },
      contacts: { weekly: [], active: 0, overdue: 0, medianHoursToFirstReply: null },
    },
  });
  const parsed = await statistics.getAdminStatistics(30);
  assert.equal(parsed.daily.length, 2);
  assert.equal(parsed.daily[0]!.averageLoadMs, 1500);
  assert.equal(parsed.daily[0]!.errors, 2);
  assert.equal(parsed.daily[1]!.searches, 0, "negative counts are not trusted");
  assert.equal(parsed.daily[1]!.averageLoadMs, null, "no samples means no average, not zero");
  assert.deepEqual(parsed.reports.byType, { other: 2 });
  assert.equal(parsed.reports.medianHoursToClose, 30.5);
  assert.equal(parsed.contacts.medianHoursToFirstReply, null);
});

test("a failed statistics query surfaces an error instead of empty charts", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const statistics = await loadStatistics({ data: null, error: { code: "42501" } });
  await assert.rejects(statistics.getAdminStatistics(30), /Statistikken kunne ikke indlæses/);
});
