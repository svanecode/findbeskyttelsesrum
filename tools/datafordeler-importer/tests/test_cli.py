from __future__ import annotations

import json
from pathlib import Path

from shelter_importer import cli
from shelter_importer.config import ImportConfig


def test_failure_writes_a_secret_free_summary(
    monkeypatch, tmp_path: Path
) -> None:
    def fail_config(
        cls: type[ImportConfig], *, require_database: bool, require_source: bool
    ) -> ImportConfig:
        del cls, require_database, require_source
        raise ValueError("apiKey=must-not-leak failed")

    monkeypatch.setattr(ImportConfig, "from_env", classmethod(fail_config))
    summary_path = tmp_path / "summary.json"

    exit_code = cli.main(
        ["--dry-run", "--max-pages", "1", "--summary", str(summary_path)]
    )

    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert exit_code == 1
    assert payload["status"] == "failed"
    assert payload["dry_run"] is True
    assert "must-not-leak" not in summary_path.read_text(encoding="utf-8")
    assert payload["error_summary"] == "apiKey=<redacted> failed"


def test_finalize_latest_does_not_require_datafordeler_credentials(
    monkeypatch, tmp_path: Path
) -> None:
    config_calls: list[tuple[bool, bool]] = []

    def load_config(
        cls: type[ImportConfig], *, require_database: bool, require_source: bool
    ) -> ImportConfig:
        del cls
        config_calls.append((require_database, require_source))
        return ImportConfig("", "https://example.supabase.co", "secret")

    class RecoveryStore:
        def __init__(self, config: ImportConfig) -> None:
            del config

        def retry_latest_completed_publication(self) -> dict[str, object]:
            return {
                "status": "published",
                "publicationId": "publication-1",
                "recoveredImportRunId": "run-1",
            }

    monkeypatch.setattr(ImportConfig, "from_env", classmethod(load_config))
    monkeypatch.setattr(cli, "AppV2Store", RecoveryStore)
    summary_path = tmp_path / "summary.json"

    exit_code = cli.main(["--finalize-latest", "--summary", str(summary_path)])

    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert exit_code == 0
    assert config_calls == [(True, False)]
    assert payload["status"] == "succeeded"
    assert payload["publication_status"] == "published"
    assert payload["recovery_status"] == "published"
    assert payload["publicationId"] == "publication-1"
