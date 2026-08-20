from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_full_import_finalizer_is_atomic_and_coverage_guarded() -> None:
    migrations = list(
        (REPOSITORY_ROOT / "supabase" / "migrations").glob(
            "*_datafordeler_import_finalizer.sql"
        )
    )
    assert len(migrations) == 1
    sql = migrations[0].read_text(encoding="utf-8")
    assert "security invoker" in sql
    assert "current_active_count * 0.80" in sql
    assert "cardinality(p_seen_references) <> p_records_seen" in sql
    assert "import_state = 'missing_from_source'" in sql
    assert "status = 'succeeded'" in sql
    assert sql.index("import_state = 'missing_from_source'") < sql.index("status = 'succeeded'")
    assert "for update" in sql
    assert "revoke all" in sql
    assert "to service_role" in sql
