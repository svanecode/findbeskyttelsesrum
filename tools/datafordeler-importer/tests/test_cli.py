from __future__ import annotations

import json
import os
import signal
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

        def refresh_shelter_path_aliases(self) -> dict[str, object]:
            return {"opened": 0, "closed": 0}

        def refresh_postal_areas_from_registrations(self) -> int:
            return 0

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


def test_sigterm_is_handled_like_an_interrupt(
    monkeypatch, tmp_path: Path
) -> None:
    def terminated(
        cls: type[ImportConfig], *, require_database: bool, require_source: bool
    ) -> ImportConfig:
        del cls, require_database, require_source
        os.kill(os.getpid(), signal.SIGTERM)
        raise AssertionError("SIGTERM should interrupt before this line")

    previous = signal.getsignal(signal.SIGTERM)
    monkeypatch.setattr(ImportConfig, "from_env", classmethod(terminated))
    summary_path = tmp_path / "summary.json"
    try:
        exit_code = cli.main(
            ["--dry-run", "--max-pages", "1", "--summary", str(summary_path)]
        )
    finally:
        signal.signal(signal.SIGTERM, previous)

    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert exit_code == 130
    assert payload["status"] == "failed"
    assert payload["error_summary"] == "Importer interrupted"


def _recovery_run(monkeypatch, tmp_path: Path, store_class: type) -> tuple[int, dict[str, object]]:
    def load_config(
        cls: type[ImportConfig], *, require_database: bool, require_source: bool
    ) -> ImportConfig:
        del cls, require_database, require_source
        return ImportConfig("", "https://example.supabase.co", "secret")

    monkeypatch.setattr(ImportConfig, "from_env", classmethod(load_config))
    monkeypatch.setattr(cli, "AppV2Store", store_class)
    summary_path = tmp_path / "summary.json"
    exit_code = cli.main(["--finalize-latest", "--summary", str(summary_path)])
    return exit_code, json.loads(summary_path.read_text(encoding="utf-8"))


def test_finalize_latest_refreshes_the_derived_data_after_publishing(
    monkeypatch, tmp_path: Path
) -> None:
    events: list[str] = []

    class RecoveryStore:
        def __init__(self, config: ImportConfig) -> None:
            del config

        def retry_latest_completed_publication(self) -> dict[str, object]:
            events.append("publish")
            return {"status": "published", "publicationId": "publication-1"}

        def refresh_shelter_path_aliases(self) -> dict[str, object]:
            events.append("paths")
            return {"opened": 1, "closed": 0}

        def refresh_postal_areas_from_registrations(self) -> int:
            events.append("postcodes")
            return 3

    exit_code, payload = _recovery_run(monkeypatch, tmp_path, RecoveryStore)

    assert exit_code == 0
    assert events == ["publish", "paths", "postcodes"]
    assert payload["derived"] == {"path_aliases": "ok", "postal_areas": "ok"}


def test_a_failed_derived_refresh_does_not_fail_a_published_recovery(
    monkeypatch, tmp_path: Path
) -> None:
    class RecoveryStore:
        def __init__(self, config: ImportConfig) -> None:
            del config

        def retry_latest_completed_publication(self) -> dict[str, object]:
            return {"status": "published", "publicationId": "publication-1"}

        def refresh_shelter_path_aliases(self) -> dict[str, object]:
            raise RuntimeError("canceling statement due to statement timeout")

        def refresh_postal_areas_from_registrations(self) -> int:
            return 0

    exit_code, payload = _recovery_run(monkeypatch, tmp_path, RecoveryStore)

    assert exit_code == 0
    assert payload["status"] == "succeeded"
    assert payload["publication_status"] == "published"
    assert payload["derived"] == {"path_aliases": "failed", "postal_areas": "ok"}


def test_a_rejected_recovery_refreshes_nothing(monkeypatch, tmp_path: Path) -> None:
    events: list[str] = []

    class RecoveryStore:
        def __init__(self, config: ImportConfig) -> None:
            del config

        def retry_latest_completed_publication(self) -> dict[str, object]:
            return {"status": "rejected", "reasons": ["too few registrations"]}

        def refresh_shelter_path_aliases(self) -> dict[str, object]:
            events.append("paths")
            return {}

        def refresh_postal_areas_from_registrations(self) -> int:
            events.append("postcodes")
            return 0

    exit_code, payload = _recovery_run(monkeypatch, tmp_path, RecoveryStore)

    assert exit_code == 1
    assert payload["publication_status"] == "rejected"
    assert events == []
