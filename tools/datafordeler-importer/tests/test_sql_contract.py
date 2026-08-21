from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_versioned_import_publication_is_atomic_and_coverage_guarded() -> None:
    migrations = list(
        (REPOSITORY_ROOT / "supabase" / "migrations").glob(
            "*_versioned_import_publishing.sql"
        )
    )
    assert len(migrations) == 1
    sql = migrations[0].read_text(encoding="utf-8")
    assert "security invoker" in sql
    assert "current_publication.record_count * 0.80" in sql
    assert "candidate_count <> p_records_seen" in sql
    assert "import_shelter_candidates" in sql
    assert "dataset_publication_shelters" in sql
    assert "import_state = 'missing_from_source'" in sql
    assert "status = 'succeeded'" in sql
    publication_sql = sql.split(
        "create or replace function app_v2.publish_datafordeler_import_v2", 1
    )[1]
    assert publication_sql.index("import_state = 'missing_from_source'") < publication_sql.index(
        "status = 'succeeded'"
    )
    assert "for update" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "revoke all" in sql
    assert "to service_role" in sql
