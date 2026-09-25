// GitHub runs scheduled workflows best-effort and often hours late, so a late
// heartbeat is a warning. Only a heartbeat older than the hard limit (or a
// missing/failed one) means the monitoring chain itself is broken.
const defaultWarningAgeMinutes = 480;
const defaultHardLimitMinutes = 1_440;

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Shared by /api/health and the admin operations page so both agree. */
export function getOperationalHeartbeatLimits(environment: Record<string, string | undefined> = process.env) {
  const warningAgeMinutes = positiveNumber(environment.HEALTH_MAX_OPERATION_AGE_MINUTES, defaultWarningAgeMinutes);
  const hardLimitMinutes = Math.max(
    warningAgeMinutes,
    positiveNumber(environment.HEALTH_MAX_OPERATION_HARD_AGE_MINUTES, defaultHardLimitMinutes),
  );
  return { warningAgeMinutes, hardLimitMinutes };
}
