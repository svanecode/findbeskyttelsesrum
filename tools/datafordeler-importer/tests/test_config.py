import pytest

from shelter_importer.config import ImportConfig


def test_publication_timeout_exceeds_the_database_budget(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_PUBLICATION_TIMEOUT_SECONDS", raising=False)
    config = ImportConfig.from_env(require_database=False, require_source=False)
    assert config.publication_timeout == 75


@pytest.mark.parametrize("timeout", ["60", "0", "nan", "inf"])
def test_unsafe_publication_timeouts_are_rejected(monkeypatch, timeout: str) -> None:
    monkeypatch.setenv("SUPABASE_PUBLICATION_TIMEOUT_SECONDS", timeout)
    with pytest.raises(ValueError, match="SUPABASE_PUBLICATION_TIMEOUT_SECONDS"):
        ImportConfig.from_env(require_database=False, require_source=False)
