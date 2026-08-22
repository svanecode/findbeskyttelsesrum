const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const source = process.env.OPERATION_HEARTBEAT_SOURCE?.trim() || "github-production-smoke";
const runIdentifier = process.env.OPERATION_HEARTBEAT_RUN_ID?.trim();
const gitSha = process.env.OPERATION_HEARTBEAT_GIT_SHA?.trim();
const status = process.env.OPERATION_HEARTBEAT_STATUS?.trim() || "ok";

if (!supabaseUrl || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SECRET_KEY kræves til et betroet heartbeat.");
}
if (!runIdentifier || runIdentifier.length > 128) {
  throw new Error("OPERATION_HEARTBEAT_RUN_ID skal indeholde 1-128 tegn.");
}
if (!gitSha || !/^[0-9a-f]{40}$/.test(gitSha)) {
  throw new Error("OPERATION_HEARTBEAT_GIT_SHA skal være et fuldt Git SHA.");
}
if (!new Set(["github-production-smoke", "manual-release"]).has(source)) {
  throw new Error("OPERATION_HEARTBEAT_SOURCE understøttes ikke.");
}
if (!new Set(["ok", "degraded", "error"]).has(status)) {
  throw new Error("OPERATION_HEARTBEAT_STATUS understøttes ikke.");
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_operational_heartbeat_v1`, {
  method: "POST",
  headers: {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    "Content-Profile": "app_v2",
    "User-Agent": "findbeskyttelsesrum-trusted-monitor/1.0",
  },
  body: JSON.stringify({
    p_source: source,
    p_run_identifier: runIdentifier,
    p_git_sha: gitSha,
    p_status: status,
  }),
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error(`Det betroede heartbeat svarede med HTTP ${response.status}.`);
}

const heartbeatId = Number(await response.json());
if (!Number.isSafeInteger(heartbeatId) || heartbeatId < 1) {
  throw new Error("Det betroede heartbeat returnerede en ugyldig identifikator.");
}

console.log(`PASS  Betroet driftsheartbeat registreret for ${source} (${gitSha.slice(0, 7)}).`);
