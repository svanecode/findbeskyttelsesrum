# Repository audit remediation — 6 September 2026

This change addresses all 11 findings from [the repository audit](2026-09-06-repository-audit.md), plus its three dependency advisories.

| Finding | Resolution |
| --- | --- |
| 1. Anonymous legacy exclusions | Revoke public table access and retire dependent legacy read APIs; retain service-role maintenance access. |
| 2. Stale readiness | Read dependencies on every origin request, bound successful CDN caching to 30 seconds with mandatory revalidation, and do not cache failures. |
| 3. Stale public pages | Share invalidation across moderation and rollback for home, map, data explanation, sitemap, shelter details, and all municipality pages. |
| 4. Publication retries | Persist immutable source snapshot time, return the existing result for repeated run IDs, bind recovery to one selected run, reject older snapshots, and use a publication timeout above the database budget. |
| 5. Incorrect nearest candidate cutoff | Calculate physical distance before limiting candidates. |
| 6. Nearby zoom resets | Make the bounds effect depend on scalar coordinates rather than a newly allocated tuple. |
| 7. Municipality initialization | Fit or focus the selected registration after the map ref is available, including first mobile activation. |
| 8. Truncated admin queues | Filter and paginate in SQL, return independent global status counts, and expose previous/next page navigation. |
| 9. Skipped release checks | Reuse the application's public key resolver and fail required parity/sanity checks when configuration is absent. |
| 10. Null report body | Validate the parsed value is an object before reading report fields. |
| 11. Retired nearby probe | Send coordinates in a JSON POST body and retain nonzero exit status on API errors. |

The lockfile updates Browserslist, HumanFS, and the affected selector parser to patched versions. Running the repaired scripts also exposed a missing `server-only` package for standalone execution; it is now pinned explicitly, and the two server-data probes run with the React server export condition. These commands retain Next's browser-import guard.

## Regression coverage

- Operational subprocess tests verify missing configuration exits nonzero, the canonical publishable key performs the real query path against an isolated HTTP fixture, and the nearby probe uses POST without coordinate query parameters.
- Browser tests verify zoom survives delayed tiles and marker selection, municipality bounds are fitted initially, and the first mobile selection is focused after map loading.
- Server and database regressions exercise failed health observations, public-route invalidation, input validation, filtered queues beyond 250 records, private exclusion grants, physical-distance candidate ranking, and publication/recovery retry semantics.
- Python importer tests cover persisted snapshot timing, safe retry selection, explicit recovery run IDs, and lost publication responses.

## Local validation

Validation used Node 24.14.0. ESLint, TypeScript, the production build, and all Node tests passed. The five browser profiles passed 128 checks with 72 intentional profile-specific skips and no failures. Importer validation passed 37 Python tests, Ruff, mypy, and source/wheel packaging. The complete npm audit reports zero known advisories.

The repaired municipality parity, exclusion parity, public sanity, and nearby POST probes completed successfully. Browser tests used a local production build with server write credentials disabled; valid submissions were mocked. Authenticated moderation is covered by server-action tests and transactional database fixtures, not a live OAuth/MFA browser session.

Database migrations and pgTAP tests must pass the fresh-database CI job before rollout. Remote verification and CI outcomes are recorded on the pull request. No live reports, contact cases, source imports, or rollbacks are needed for these checks.

## Rollout

Apply the four additive migrations before updating the scheduled importer or deploying the new admin queues. Existing public routes and the original publication RPC signature remain compatible; the unsafe no-argument recovery mutation is retired. Updating application files in Git does not itself deploy the Vercel site, whose repository release process uses a separate deployment step.

The original `.playwright-mcp/` directory is unrelated to this change and is not included in the commit.
