const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const windowHours = Number(process.env.METRICS_HEALTH_WINDOW_HOURS ?? "2");
const maximumErrors = Number(process.env.METRICS_HEALTH_MAX_ERRORS ?? "25");

if (!supabaseUrl || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SECRET_KEY kræves til den private målingskontrol.");
}
if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 24) {
  throw new Error("METRICS_HEALTH_WINDOW_HOURS skal være et helt tal mellem 1 og 24.");
}
if (!Number.isInteger(maximumErrors) || maximumErrors < 1) {
  throw new Error("METRICS_HEALTH_MAX_ERRORS skal være et positivt helt tal.");
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_product_metrics_health_v1`, {
  method: "POST",
  headers: {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    "Content-Profile": "app_v2",
    "User-Agent": "findbeskyttelsesrum-metrics-monitor/1.0",
  },
  body: JSON.stringify({ p_hours: windowHours }),
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error(`Den private målingskontrol svarede med HTTP ${response.status}.`);
}

const payload = await response.json();
const eventCount = Number(payload?.eventCount);
const errorCount = Number(payload?.errorCount);

if (
  !Number.isSafeInteger(eventCount)
  || eventCount < 0
  || !Number.isSafeInteger(errorCount)
  || errorCount < 0
) {
  throw new Error("Den private målingskontrol returnerede en ugyldig kontrakt.");
}
if (errorCount > maximumErrors) {
  throw new Error(`${errorCount} tekniske fejl er registreret på ${windowHours} timer; grænsen er ${maximumErrors}.`);
}

console.log(`PASS  Ubetroede produktmålinger — ${eventCount} hændelser og ${errorCount} fejl på ${windowHours} timer.`);
