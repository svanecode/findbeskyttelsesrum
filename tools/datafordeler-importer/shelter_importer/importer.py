"""Import orchestration and lifecycle rules."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from .config import CANONICAL_SOURCE_NAME, ImportConfig
from .datafordeler import DatafordelerSource
from .models import ImportSummary
from .supabase import AppV2Store, PublicationRejectedError, safe_error_summary

logger = logging.getLogger("shelter_importer")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Importer:
    def __init__(
        self,
        config: ImportConfig,
        *,
        source: DatafordelerSource | None = None,
        store: AppV2Store | None = None,
        clock: Callable[[], str] = utc_now,
    ) -> None:
        self.config = config
        self.source = source or DatafordelerSource(config)
        self.store = store
        self.clock = clock

    def run(
        self,
        *,
        dry_run: bool,
        max_pages: int | None,
        resume_latest: bool,
    ) -> ImportSummary:
        if dry_run and resume_latest:
            raise ValueError("--resume-latest cannot be combined with --dry-run")
        if max_pages is not None and max_pages <= 0:
            raise ValueError("--max-pages must be positive")
        if not dry_run and self.store is None:
            raise ValueError("A Supabase store is required in write mode")

        resumed: dict[str, Any] | None = None
        run: dict[str, Any] | None = None
        if not dry_run:
            assert self.store is not None
            resumed = self.store.latest_failed_run() if resume_latest else None
            if resume_latest and resumed is None:
                raise ValueError("No failed Datafordeler import run with a checkpoint was found")
            run = self.store.create_import_run(resumed_from=resumed)

        snapshot_at = (
            str(resumed.get("snapshot_at") or resumed["started_at"]) if resumed else self.clock()
        )
        summary = ImportSummary(
            dry_run=dry_run,
            source_name=CANONICAL_SOURCE_NAME,
            pages_fetched=int((resumed or {}).get("pages_fetched") or 0),
            bbr_records_fetched=int((resumed or {}).get("bbr_fetched_count") or 0),
            bbr_eligible=int((resumed or {}).get("bbr_eligible_count") or 0),
            records_seen=int((resumed or {}).get("records_seen") or 0),
            records_upserted=int((resumed or {}).get("records_upserted") or 0),
            bbr_dar_linked=int((resumed or {}).get("dar_linked_count") or 0),
            dar_missing_count=int((resumed or {}).get("dar_missing_count") or 0),
            mapping_failure_count=int((resumed or {}).get("mapping_failure_count") or 0),
            warnings_count=int((resumed or {}).get("warning_count") or 0),
            resumed_from_import_run_id=(str(resumed["id"]) if resumed else None),
            last_successful_cursor=(resumed or {}).get("last_successful_cursor"),
            import_run_id=(str(run["id"]) if run else None),
        )
        last_page_had_next = True

        try:
            for page in self.source.pages(
                snapshot_at=snapshot_at,
                after=summary.last_successful_cursor,
                start_page=summary.pages_fetched,
                max_pages=max_pages,
            ):
                next_seen = summary.records_seen + len(page.records)
                next_upserted = summary.records_upserted
                next_pages = summary.pages_fetched + page.source_pages
                next_cursor = page.end_cursor
                next_bbr_fetched = summary.bbr_records_fetched + page.fetched_bbr_records
                next_bbr_eligible = summary.bbr_eligible + page.eligible_bbr_records
                next_dar_linked = summary.bbr_dar_linked + len(page.records)
                next_dar_missing = summary.dar_missing_count + page.dar_missing_records
                next_mapping_failures = (
                    summary.mapping_failure_count + page.mapping_failure_records
                )
                next_warnings = summary.warnings_count + len(page.warnings)

                if dry_run:
                    next_upserted = 0
                else:
                    assert self.store is not None and summary.import_run_id is not None
                    next_upserted += self.store.stage_records(page.records, summary.import_run_id)
                    # Cursor is durable only after every mapping/write for the page succeeds.
                    self.store.checkpoint_import_run(
                        summary.import_run_id,
                        records_seen=next_seen,
                        records_upserted=next_upserted,
                        pages_fetched=next_pages,
                        cursor=next_cursor,
                        bbr_fetched_count=next_bbr_fetched,
                        bbr_eligible_count=next_bbr_eligible,
                        dar_linked_count=next_dar_linked,
                        dar_missing_count=next_dar_missing,
                        mapping_failure_count=next_mapping_failures,
                        warning_count=next_warnings,
                    )

                summary.records_seen = next_seen
                summary.records_upserted = next_upserted
                summary.pages_fetched = next_pages
                summary.last_successful_cursor = next_cursor
                summary.bbr_records_fetched = next_bbr_fetched
                summary.bbr_eligible = next_bbr_eligible
                summary.bbr_dar_linked = next_dar_linked
                summary.dar_missing_count = next_dar_missing
                summary.mapping_failure_count = next_mapping_failures
                summary.warnings_count = next_warnings
                last_page_had_next = page.has_next_page
                logger.info(
                    "Checkpoint through BBR page %s: BBR=%s linked=%s totalLinked=%s hasNext=%s",
                    summary.pages_fetched,
                    page.fetched_bbr_records,
                    len(page.records),
                    summary.bbr_dar_linked,
                    page.has_next_page,
                )

            summary.http_statuses = set(self.source.statuses_seen)
            if summary.pages_fetched == int((resumed or {}).get("pages_fetched") or 0):
                raise RuntimeError("Datafordeler returned no pages")

            if dry_run:
                summary.status = "succeeded"
                summary.missing_transitions_skipped_reason = "dry-run never writes"
                summary.publication_status = "not_published"
                return summary

            assert self.store is not None and summary.import_run_id is not None
            finished_at = self.clock()
            is_complete_scan = max_pages is None and not last_page_had_next
            if is_complete_scan:
                publication = self.store.publish_full_import(
                    summary.import_run_id,
                    records_seen=summary.records_seen,
                    records_staged=summary.records_upserted,
                    pages_fetched=summary.pages_fetched,
                    cursor=summary.last_successful_cursor,
                    finished_at=finished_at,
                    bbr_fetched_count=summary.bbr_records_fetched,
                    bbr_eligible_count=summary.bbr_eligible,
                    dar_linked_count=summary.bbr_dar_linked,
                    dar_missing_count=summary.dar_missing_count,
                    mapping_failure_count=summary.mapping_failure_count,
                    warning_count=summary.warnings_count,
                )
                summary.missing_transitions_applied = True
                summary.publication_status = "published"
                publication_id = publication.get("publicationId")
                summary.publication_id = str(publication_id) if publication_id else None
                summary.quality_gate_passed = True
                raw_metrics = publication.get("qualityMetrics")
                summary.quality_metrics = raw_metrics if isinstance(raw_metrics, dict) else {}
            else:
                reason = "capped run: source traversal was intentionally incomplete"
                self.store.succeed_without_missing(
                    summary.import_run_id,
                    records_seen=summary.records_seen,
                    records_upserted=summary.records_upserted,
                    pages_fetched=summary.pages_fetched,
                    cursor=summary.last_successful_cursor,
                    finished_at=finished_at,
                    reason=reason,
                    bbr_fetched_count=summary.bbr_records_fetched,
                    bbr_eligible_count=summary.bbr_eligible,
                    dar_linked_count=summary.bbr_dar_linked,
                    dar_missing_count=summary.dar_missing_count,
                    mapping_failure_count=summary.mapping_failure_count,
                    warning_count=summary.warnings_count,
                )
                summary.missing_transitions_skipped_reason = reason
                summary.publication_status = "not_published"
            summary.status = "succeeded"
            return summary
        except (Exception, KeyboardInterrupt) as exc:
            summary.http_statuses = set(self.source.statuses_seen)
            summary.status = "failed"
            if isinstance(exc, PublicationRejectedError):
                summary.publication_status = "rejected"
                summary.quality_gate_passed = False
                summary.quality_gate_reasons = exc.reasons
                raw_metrics = exc.result.get("qualityMetrics")
                summary.quality_metrics = raw_metrics if isinstance(raw_metrics, dict) else {}
            if not dry_run and summary.import_run_id and self.store:
                try:
                    self.store.fail_import_run(
                        summary.import_run_id,
                        error_summary=safe_error_summary(str(exc) or type(exc).__name__),
                        records_seen=summary.records_seen,
                        records_upserted=summary.records_upserted,
                        pages_fetched=summary.pages_fetched,
                        cursor=summary.last_successful_cursor,
                        finished_at=self.clock(),
                        bbr_fetched_count=summary.bbr_records_fetched,
                        bbr_eligible_count=summary.bbr_eligible,
                        dar_linked_count=summary.bbr_dar_linked,
                        dar_missing_count=summary.dar_missing_count,
                        mapping_failure_count=summary.mapping_failure_count,
                        warning_count=summary.warnings_count,
                    )
                except Exception as lifecycle_error:
                    logger.error(
                        "Could not mark import run failed: %s",
                        safe_error_summary(str(lifecycle_error)),
                    )
            raise
