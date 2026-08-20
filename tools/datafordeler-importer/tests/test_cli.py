from __future__ import annotations

import json
from pathlib import Path

from shelter_importer import cli
from shelter_importer.config import ImportConfig


def test_failure_writes_a_secret_free_summary(
    monkeypatch, tmp_path: Path
) -> None:
    def fail_config(
        cls: type[ImportConfig], *, require_database: bool
    ) -> ImportConfig:
        del cls, require_database
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
