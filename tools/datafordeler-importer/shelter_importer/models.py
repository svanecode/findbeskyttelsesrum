"""Importer domain models."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Municipality:
    code: str
    slug: str
    name: str
    region_name: str | None = None


@dataclass(frozen=True)
class ShelterRecord:
    municipality: Municipality
    canonical_source_reference: str
    slug: str
    name: str
    address_line1: str
    postal_code: str
    city: str
    latitude: float | None
    longitude: float | None
    capacity: int
    source_application_code: str | None
    status: str = "under_review"


@dataclass
class PageResult:
    records: list[ShelterRecord]
    end_cursor: str | None
    has_next_page: bool
    fetched_bbr_records: int
    warnings: list[str] = field(default_factory=list)
    source_pages: int = 1


@dataclass
class ImportSummary:
    dry_run: bool
    source_name: str
    http_statuses: set[int] = field(default_factory=set)
    pages_fetched: int = 0
    bbr_records_fetched: int = 0
    records_seen: int = 0
    records_upserted: int = 0
    bbr_dar_linked: int = 0
    warnings_count: int = 0
    resumed_from_import_run_id: str | None = None
    last_successful_cursor: str | None = None
    missing_transitions_applied: bool = False
    missing_transitions_skipped_reason: str | None = None
    import_run_id: str | None = None
    status: str = "running"

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["http_statuses"] = sorted(self.http_statuses)
        return payload
