# Free release checks and observability

The operational setup uses only the repository's existing GitHub Actions, Vercel deployment and Supabase project.
No paid analytics, map or error-tracking product is required.

## Pull request and release checks

`.github/workflows/application-quality.yml` runs linting, TypeScript, unit/security contract tests, a fresh migration
replay, all database integrity tests, a production build and the complete Playwright browser story on every pull request.
The browser gate covers desktop Chromium, Firefox and WebKit plus mobile Chromium and iPhone-sized WebKit, and it
repeats on pushes to `main`.
The local HTTP test build disables only CSP's HTTPS-upgrade directives; ordinary production builds retain them.

The release job deliberately receives no `SUPABASE_SECRET_KEY`. It reads the public Supabase URL and publishable key
from the repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with the existing
same-named secrets as a compatibility fallback for trusted branches. Configure both repository variables so fork and
Dependabot pull requests can run the public read-only build; they are browser-visible values, not write credentials.

`.github/workflows/production-smoke.yml` checks the live homepage, public data health, the Adressevælger address search, nearby results, the full
national map boundary including Bornholm, municipality pages, detail pages and reporting validation twice per hour.
It also reads a service-only two-hour metrics aggregate. A failed scheduled run creates or updates one GitHub issue
labelled `production-alert`; the next successful run closes it.

`/api/health` returns the deployed Git SHA, deployment ID, build timestamp, current publication ID, monotonic public-data
revision, originating import run ID, public record count, data age, and the latest trusted operational heartbeat. It returns `503 degraded` when data is older than 48 hours, the public count
falls below the safety floor, publication provenance is inconsistent, or required production identity is missing. The
production smoke compares the endpoint's SHA with the workflow's expected commit.
Each origin readiness request reads fresh database dependencies. Healthy responses may be reused by the CDN for at most
30 seconds and must then be revalidated; unhealthy responses are not cached. A failed database read cannot reuse an old
healthy application snapshot or freeze the age of the operational heartbeat.

Nearby accepts coordinates only in a bounded POST body. The landskort accepts only a bounded viewport with the current
data revision. Landskort, nearby, reports, errors and anonymous metrics use the shared database limiter; its HMAC key is
derived from the dedicated server-only `RATE_LIMIT_HASH_SECRET`, never the Supabase service key.

Only a successful server-side production smoke writes `app_v2.operational_heartbeats`. Browser metrics cannot write this
table or use `monitor_heartbeat`. The next run may tolerate only an old or missing operational heartbeat while it performs
the public recovery checks; every other degraded reason still fails. The new heartbeat is written only after those checks
pass, so a failed run cannot report itself healthy.

An external free HTTP monitor checks `/api/health` independently of GitHub. Because the endpoint includes heartbeat age,
the monitor also detects a scheduled workflow that never starts. Setup and recovery are documented in
[`../operations/external-monitoring.md`](../operations/external-monitoring.md).

## Privacy boundary

`app_v2.product_metrics_hourly` contains only hour, fixed event name, count, rounded duration total and duration sample
count. The public API roles cannot read or write it. The ingest endpoint accepts exactly `eventName` and optional
`durationMs`; any extra field is rejected. Local builds and preview deployments do not write metrics. Counters older
than 90 days are removed during the next increment.

The model deliberately has no columns for IP address, user, session, cookies, URL, search text, address or coordinates.
The MFA-protected `/admin/drift` page reads only a 30-day aggregate through the server-side service role.

## Emergency load shedding

Set `PRODUCT_METRICS_DISABLED=1` in the Vercel production environment and redeploy to stop every product-metric database write, including the metric rate-limit bucket. `/api/metrics` then answers `202` without touching the database, and the search keeps working. `scripts/monitor/product-metrics-health.mjs` will report missing aggregates while the switch is on; remove the variable and redeploy afterwards.

## Alarm threshold

The scheduled check fails when more than 25 aggregate technical errors occur within two hours. Low or zero traffic is
valid and does not trigger an alarm. Change `METRICS_HEALTH_MAX_ERRORS` only after reviewing ordinary production volume.

## Accepted database advisor findings

The security advisor still reports five owner-rights public views. They are the explicit, column-limited public read
boundary over private base tables; changing the main shelter view to invoker rights would either break public reads or
expose the base tables. The four safe derived marker/sitemap views do use invoker rights. The advisor's authenticated
security-definer function warnings are also intentional: every such function repeats the stable GitHub identity,
allowlist, role and MFA checks inside the database.

Password leak protection is not part of the public flow because public users do not have accounts and moderators sign
in through GitHub plus MFA. Performance notices for unused new indexes must be reviewed after representative production
traffic; they are not evidence that an index is currently safe to delete. The two unindexed legacy `public.sheltersv2`
foreign keys are outside the active `app_v2` application and importer boundary.
