import "server-only";

import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export type OperationalHealth = {
  heartbeatFound: boolean;
  source: string | null;
  runIdentifier: string | null;
  gitSha: string | null;
  status: "ok" | "degraded" | "error" | null;
  checkedAt: string | null;
  ageMinutes: number | null;
  maximumAgeMinutes: number;
  isFresh: boolean;
};

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function getOperationalHealth(maximumAgeMinutes = 90): Promise<OperationalHealth> {
  const boundedMaximumAge = Math.max(15, Math.min(Math.round(maximumAgeMinutes), 1_440));
  const { data, error } = await createAppV2AdminClient().rpc("get_operational_health_v1", {
    p_max_age_minutes: boundedMaximumAge,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Could not load trusted operational health${error ? `: ${error.code}` : "."}`);
  }

  const row = data as Record<string, unknown>;
  const status = row.status === "ok" || row.status === "degraded" || row.status === "error"
    ? row.status
    : null;

  return {
    heartbeatFound: row.heartbeatFound === true,
    source: typeof row.source === "string" ? row.source : null,
    runIdentifier: typeof row.runIdentifier === "string" ? row.runIdentifier : null,
    gitSha: typeof row.gitSha === "string" ? row.gitSha : null,
    status,
    checkedAt: typeof row.checkedAt === "string" ? row.checkedAt : null,
    ageMinutes: finiteNumber(row.ageMinutes),
    maximumAgeMinutes: finiteNumber(row.maximumAgeMinutes) ?? boundedMaximumAge,
    isFresh: row.isFresh === true,
  };
}
