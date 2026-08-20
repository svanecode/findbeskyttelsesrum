from __future__ import annotations

from conftest import QueueSession, Response, shelter

from shelter_importer.config import ImportConfig
from shelter_importer.supabase import AppV2Store, safe_error_summary


def test_idempotent_shelter_upsert_inserts_once_then_updates() -> None:
    session = QueueSession(
        [
            Response(200, []),  # preload municipalities
            Response(200, []),  # preload shelters
            Response(201, [{"id": "municipality-1"}]),
            Response(201, [{"id": "shelter-1"}]),
            Response(201),  # source upsert
            Response(204),  # shelter update
            Response(201),  # source upsert
        ]
    )
    store = AppV2Store(
        ImportConfig(
            "data-key",
            "https://example.supabase.co",
            "service-secret",
            supabase_write_workers=1,
        ),
        session=session,  # type: ignore[arg-type]
        sleep=lambda _: None,
        jitter=lambda: 0,
    )
    store.preload()
    record = shelter()
    assert store.upsert_records([record], "2026-07-13T12:00:00Z", "run-1") == 1
    assert store.upsert_records([record], "2026-07-13T13:00:00Z", "run-2") == 1

    shelter_calls = [call for call in session.calls if call["url"].endswith("/shelters")]
    assert [call["method"] for call in shelter_calls] == ["GET", "POST", "PATCH"]
    inserted = shelter_calls[1]["json"]
    assert inserted["canonical_source_name"] == "datafordeler-bbr-dar"
    assert inserted["canonical_source_reference"] == "building-1"
    assert inserted["last_seen_at"] == "2026-07-13T12:00:00Z"
    assert inserted["last_imported_at"] == "2026-07-13T12:00:00Z"
    assert inserted["status"] == "under_review"

    source_calls = [call for call in session.calls if call["url"].endswith("/shelter_sources")]
    assert len(source_calls) == 2
    assert isinstance(source_calls[0]["json"], list)
    assert len(source_calls[0]["json"]) == 1
    source_payload = source_calls[0]["json"][0]
    assert source_payload["shelter_id"] == "shelter-1"
    assert source_payload["import_run_id"] == "run-1"
    assert source_payload["source_reference"] == "building-1"


def test_error_summary_redacts_query_credentials() -> None:
    value = safe_error_summary(
        "apiKey=standalone-secret failed "
        "https://graphql.datafordeler.dk/BBR/v3?apiKey=topsecret authorization=BearerX"
    )
    assert "topsecret" not in value
    assert "standalone-secret" not in value
    assert "BearerX" not in value
