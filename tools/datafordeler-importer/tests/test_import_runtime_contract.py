from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_import_runtime_migration_scopes_timeout_and_defers_cache_refresh() -> None:
    migrations = list(
        (REPOSITORY_ROOT / "supabase" / "migrations").glob(
            "*_harden_import_publication_runtime.sql"
        )
    )
    assert len(migrations) == 1
    sql = migrations[0].read_text(encoding="utf-8")

    assert "publish_datafordeler_import_v3" in sql
    assert "set statement_timeout = '60s'" in sql
    assert "alter role" not in sql.lower()
    assert "alter database" not in sql.lower()
    assert "current_setting('app_v2.quality_gate_passed', true) = 'true'" in sql
    assert "refresh_municipality_summary_public_v1" in sql
    assert "bump_public_data_revision_v1" in sql


def test_completed_publication_recovery_is_explicit_and_fail_closed() -> None:
    migrations = list(
        (REPOSITORY_ROOT / "supabase" / "migrations").glob(
            "*_recover_completed_import_publication.sql"
        )
    )
    assert len(migrations) == 1
    sql = migrations[0].read_text(encoding="utf-8")

    assert "source_scan_complete boolean not null default false" in sql
    assert "retry_latest_completed_datafordeler_publication_v1" in sql
    assert "run.source_scan_complete = true" in sql
    assert "run.records_upserted = run.records_seen" in sql
    assert "candidate.import_run_id = run.id" in sql
    assert "publication_status = 'staging'" in sql
    assert "quality_gate_passed is null" in sql
    assert "set statement_timeout = '60s'" in sql
    assert "to service_role" in sql
