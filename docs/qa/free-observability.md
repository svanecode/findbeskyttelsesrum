# Free release checks and observability

The operational setup uses only the repository's existing GitHub Actions, Vercel deployment and Supabase project.
No paid analytics, map or error-tracking product is required.

## Pull request and release checks

`.github/workflows/application-quality.yml` runs linting, TypeScript, unit/security contract tests, a fresh migration
replay, and database integrity tests on every pull request without production credentials. Pushes to `main` additionally
build the production app and run the complete Playwright browser story using existing GitHub repository secrets.

`.github/workflows/production-smoke.yml` checks the live homepage, public data health, DAWA, nearby results, the full
national map boundary including Bornholm, municipality pages, detail pages and reporting validation twice per hour.
It also reads a service-only two-hour metrics aggregate. A failed scheduled run creates or updates one GitHub issue
labelled `production-alert`; the next successful run closes it.

`/api/health` returns the deployed Git SHA, deployment ID, build timestamp, current publication ID, originating import
run ID, public record count, and data age. It returns `503 degraded` when data is older than 48 hours, the public count
falls below the safety floor, publication provenance is inconsistent, or required production identity is missing. The
production smoke compares the endpoint's SHA with the workflow's expected commit.

The public smoke posts one fixed `monitor_heartbeat` event before the private aggregate check. This verifies the complete
ingest path without sending a location, URL or user value; a missing heartbeat fails the scheduled check.

## Privacy boundary

`app_v2.product_metrics_hourly` contains only hour, fixed event name, count, rounded duration total and duration sample
count. The public API roles cannot read or write it. The ingest endpoint accepts exactly `eventName` and optional
`durationMs`; any extra field is rejected. Local builds and preview deployments do not write metrics. Counters older
than 90 days are removed during the next increment.

The model deliberately has no columns for IP address, user, session, cookies, URL, search text, address or coordinates.
The MFA-protected `/admin/drift` page reads only a 30-day aggregate through the server-side service role.

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
