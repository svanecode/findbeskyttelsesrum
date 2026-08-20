"""Validated importer configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass

BBR_GRAPHQL_URL = "https://graphql.datafordeler.dk/BBR/v3"
DAR_GRAPHQL_URL = "https://graphql.datafordeler.dk/DAR/v3"
CANONICAL_SOURCE_NAME = "datafordeler-bbr-dar"
SOURCE_DISPLAY_NAME = "Datafordeler BBR + DAR"
SOURCE_DOCS_URL = "https://datafordeler.dk/dataoversigt/bygnings-og-boligregistret-bbr/bbr-graphql/"


def _positive_int(name: str, default: int, maximum: int | None = None) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value <= 0 or (maximum is not None and value > maximum):
        suffix = f" at most {maximum}" if maximum else ""
        raise ValueError(f"{name} must be positive{suffix}")
    return value


def _positive_float(name: str, default: float) -> float:
    raw = os.getenv(name, str(default))
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


@dataclass(frozen=True)
class ImportConfig:
    datafordeler_api_key: str
    supabase_url: str | None
    supabase_secret_key: str | None
    page_size: int = 500
    dar_batch_size: int = 100
    request_timeout: float = 45.0
    max_request_attempts: int = 4
    retry_base_seconds: float = 1.0
    supabase_batch_size: int = 200
    supabase_write_workers: int = 12

    @classmethod
    def from_env(cls, *, require_database: bool) -> ImportConfig:
        api_key = os.getenv("DATAFORDELER_API_KEY", "").strip()
        supabase_url = os.getenv("SUPABASE_URL", "").strip() or None
        secret_key = os.getenv("SUPABASE_SECRET_KEY", "").strip() or None

        # Backward-compatible server-only alias. It is never logged or exposed.
        if secret_key is None:
            secret_key = os.getenv("SUPABASE_KEY", "").strip() or None

        missing: list[str] = []
        if not api_key:
            missing.append("DATAFORDELER_API_KEY")
        if require_database and not supabase_url:
            missing.append("SUPABASE_URL")
        if require_database and not secret_key:
            missing.append("SUPABASE_SECRET_KEY")
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

        for name in os.environ:
            if name.startswith("NEXT_PUBLIC_") and ("SERVICE_ROLE" in name or "SECRET_KEY" in name):
                raise ValueError(
                    "Supabase service-role/secret keys must never use a NEXT_PUBLIC_* variable"
                )

        return cls(
            datafordeler_api_key=api_key,
            supabase_url=supabase_url,
            supabase_secret_key=secret_key,
            page_size=_positive_int("DATAFORDELER_PAGE_SIZE", 500, maximum=1000),
            dar_batch_size=_positive_int("DATAFORDELER_DAR_BATCH_SIZE", 100, maximum=100),
            request_timeout=_positive_float("DATAFORDELER_REQUEST_TIMEOUT_SECONDS", 45.0),
            max_request_attempts=_positive_int("MAX_REQUEST_ATTEMPTS", 4, maximum=10),
            retry_base_seconds=_positive_float("RETRY_BASE_SECONDS", 1.0),
            supabase_batch_size=_positive_int("SUPABASE_BATCH_SIZE", 200, maximum=500),
            supabase_write_workers=_positive_int("SUPABASE_WRITE_WORKERS", 12, maximum=32),
        )
