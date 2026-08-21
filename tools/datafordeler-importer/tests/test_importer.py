from __future__ import annotations

from typing import Any

import pytest
from conftest import shelter

from shelter_importer.config import ImportConfig
from shelter_importer.importer import Importer
from shelter_importer.models import PageResult


class Source:
    def __init__(self, pages: list[PageResult], failure: BaseException | None = None) -> None:
        self._pages = pages
        self.failure = failure
        self.statuses_seen = {200}
        self.args: dict[str, Any] = {}

    def pages(self, **kwargs: Any):
        self.args = kwargs
        yield from self._pages
        if self.failure:
            raise self.failure


class Store:
    def __init__(self, resumed: dict[str, Any] | None = None) -> None:
        self.resumed = resumed
        self.events: list[str] = []

    def latest_failed_run(self):
        return self.resumed

    def create_import_run(self, *, resumed_from: Any):
        self.events.append("running")
        return {"id": "run-1"}

    def stage_records(self, records: list[Any], run_id: str) -> int:
        self.events.append("stage")
        return len(records)

    def checkpoint_import_run(self, run_id: str, **kwargs: Any) -> None:
        self.events.append("checkpoint")

    def publish_full_import(self, run_id: str, **kwargs: Any) -> dict[str, Any]:
        self.events.append("publish")
        return {
            "status": "published",
            "publicationId": "publication-1",
            "qualityGatePassed": True,
            "qualityMetrics": {"recordCount": 1},
        }

    def succeed_without_missing(self, run_id: str, **kwargs: Any) -> None:
        self.events.append("succeeded_without_missing")

    def fail_import_run(self, run_id: str, **kwargs: Any) -> None:
        self.events.append("failed")


def page(has_next: bool = False) -> PageResult:
    return PageResult([shelter()], "cursor-1", has_next, 1)


def importer(source: Source, store: Store) -> Importer:
    return Importer(
        ImportConfig("key", "https://example.supabase.co", "secret"),
        source=source,  # type: ignore[arg-type]
        store=store,  # type: ignore[arg-type]
        clock=lambda: "2026-07-13T12:00:00Z",
    )


def test_full_success_stages_then_atomically_publishes() -> None:
    store = Store()
    summary = importer(Source([page()]), store).run(
        dry_run=False, max_pages=None, resume_latest=False
    )
    assert summary.status == "succeeded"
    assert summary.missing_transitions_applied is True
    assert summary.publication_status == "published"
    assert summary.publication_id == "publication-1"
    assert store.events == ["running", "stage", "checkpoint", "publish"]


def test_capped_run_never_marks_missing() -> None:
    store = Store()
    summary = importer(Source([page(has_next=True)]), store).run(
        dry_run=False, max_pages=1, resume_latest=False
    )
    assert summary.missing_transitions_applied is False
    assert "publish" not in store.events
    assert store.events[-1] == "succeeded_without_missing"


def test_resume_uses_original_snapshot_and_can_publish_complete_staging() -> None:
    resumed = {
        "id": "failed-1",
        "started_at": "2026-07-01T01:02:03Z",
        "snapshot_at": "2026-06-30T23:59:00Z",
        "records_seen": 10,
        "records_upserted": 10,
        "pages_fetched": 2,
        "last_successful_cursor": "old-cursor",
    }
    store = Store(resumed)
    source = Source([page()])
    summary = importer(source, store).run(dry_run=False, max_pages=None, resume_latest=True)
    assert source.args["snapshot_at"] == resumed["snapshot_at"]
    assert source.args["after"] == "old-cursor"
    assert summary.records_seen == 11
    assert summary.publication_status == "published"
    assert store.events[-1] == "publish"


def test_failure_after_partial_page_does_not_apply_missing_and_marks_failed() -> None:
    store = Store()
    with pytest.raises(RuntimeError, match="upstream stopped"):
        importer(Source([page(has_next=True)], RuntimeError("upstream stopped")), store).run(
            dry_run=False, max_pages=None, resume_latest=False
        )
    assert "failed" in store.events
    assert "publish" not in store.events


def test_interrupted_import_marks_run_failed_without_missing_transition() -> None:
    store = Store()
    with pytest.raises(KeyboardInterrupt):
        importer(Source([], KeyboardInterrupt()), store).run(
            dry_run=False, max_pages=None, resume_latest=False
        )
    assert store.events == ["running", "failed"]


def test_dry_run_has_no_database_writes_and_reports_mapping() -> None:
    store = Store()
    summary = importer(Source([page()]), store).run(dry_run=True, max_pages=1, resume_latest=False)
    assert summary.status == "succeeded"
    assert summary.records_seen == 1
    assert summary.bbr_dar_linked == 1
    assert store.events == []
