from __future__ import annotations

import pytest
from conftest import QueueSession, Response, shelter

from shelter_importer.config import ImportConfig
from shelter_importer.supabase import AppV2Store, PublicationRejectedError, safe_error_summary


def store_with_session(session: QueueSession) -> AppV2Store:
    return AppV2Store(
        ImportConfig(
            "data-key",
            "https://example.supabase.co",
            "service-secret",
        ),
        session=session,  # type: ignore[arg-type]
        sleep=lambda _: None,
        jitter=lambda: 0,
    )


def test_staging_upserts_candidates_without_touching_public_baseline() -> None:
    session = QueueSession(
        [
            Response(201),
            Response(201),
        ]
    )
    store = store_with_session(session)
    record = shelter()
    assert store.stage_records([record], "run-1") == 1
    assert store.stage_records([record], "run-1") == 1

    assert len(session.calls) == 2
    assert all(call["url"].endswith("/import_shelter_candidates") for call in session.calls)
    assert all(call["method"] == "POST" for call in session.calls)
    staged = session.calls[0]["json"][0]
    assert staged["import_run_id"] == "run-1"
    assert staged["source_name"] == "datafordeler-bbr-dar"
    assert staged["canonical_source_reference"] == "building-1"
    assert staged["municipality_code"] == "0101"
    assert staged["status"] == "under_review"


def test_resumed_run_prunes_stale_staging_and_copies_checkpointed_candidates() -> None:
    session = QueueSession(
        [
            Response(200, 4),
            Response(201, [{"id": "new-run"}]),
            Response(200, 500),
        ]
    )
    store = store_with_session(session)

    run = store.create_import_run(
        resumed_from={
            "id": "failed-run",
            "records_seen": 500,
            "records_upserted": 500,
            "pages_fetched": 1,
            "last_successful_page": 1,
            "last_successful_cursor": "cursor-1",
        }
    )

    assert run["id"] == "new-run"
    assert session.calls[0]["url"].endswith("/rpc/prune_datafordeler_import_candidates_v1")
    assert session.calls[1]["url"].endswith("/import_runs")
    assert session.calls[1]["json"]["publication_status"] == "staging"
    assert session.calls[2]["url"].endswith("/rpc/copy_datafordeler_import_candidates_v1")
    assert session.calls[2]["json"] == {
        "p_from_import_run_id": "failed-run",
        "p_to_import_run_id": "new-run",
    }


def test_resume_only_selects_technical_staging_failures_with_candidates() -> None:
    session = QueueSession(
        [
            Response(
                200,
                [
                    {
                        "id": "technical-run",
                        "started_at": "2026-08-21T12:00:00Z",
                        "records_seen": 5,
                        "records_upserted": 5,
                        "pages_fetched": 2,
                        "last_successful_page": 2,
                        "last_successful_cursor": "cursor-2",
                        "resumed_from_import_run_id": None,
                        "publication_status": "staging",
                        "quality_gate_passed": None,
                        "bbr_fetched_count": 100,
                        "bbr_eligible_count": 6,
                        "dar_linked_count": 5,
                        "dar_missing_count": 1,
                        "mapping_failure_count": 0,
                        "warning_count": 1,
                    }
                ],
            ),
            Response(200, [{"import_run_id": "technical-run"}]),
        ]
    )
    store = store_with_session(session)

    resumed = store.latest_failed_run()

    assert resumed is not None and resumed["id"] == "technical-run"
    query = session.calls[0]["params"]
    assert query["publication_status"] == "eq.staging"
    assert query["quality_gate_passed"] == "is.null"
    assert session.calls[1]["url"].endswith("/import_shelter_candidates")


def test_quality_rejected_run_is_not_a_resume_candidate() -> None:
    session = QueueSession([Response(200, [])])
    store = store_with_session(session)

    assert store.latest_failed_run() is None
    query = session.calls[0]["params"]
    assert query["publication_status"] == "eq.staging"
    assert query["quality_gate_passed"] == "is.null"


def test_quality_gate_rejection_is_a_failed_publication() -> None:
    session = QueueSession(
        [
            Response(
                200,
                {
                    "status": "rejected",
                    "qualityGatePassed": False,
                    "qualityGateReasons": ["Kun 10 poster mod minimum 500."],
                    "qualityMetrics": {"recordCount": 10},
                },
            )
        ]
    )
    store = store_with_session(session)

    with pytest.raises(PublicationRejectedError, match="Kun 10 poster"):
        store.publish_full_import(
            "run-1",
            records_seen=10,
            records_staged=10,
            pages_fetched=1,
            cursor="cursor-1",
            finished_at="2026-08-21T12:00:00Z",
            bbr_fetched_count=100,
            bbr_eligible_count=10,
            dar_linked_count=10,
            dar_missing_count=0,
            mapping_failure_count=0,
            warning_count=0,
        )

    assert session.calls[0]["url"].endswith("/rpc/publish_datafordeler_import_v3")
    assert session.calls[0]["json"]["p_bbr_eligible_count"] == 10


def test_error_summary_redacts_query_credentials() -> None:
    value = safe_error_summary(
        "apiKey=standalone-secret failed "
        "https://graphql.datafordeler.dk/BBR/v3?apiKey=topsecret authorization=BearerX"
    )
    assert "topsecret" not in value
    assert "standalone-secret" not in value
    assert "BearerX" not in value
