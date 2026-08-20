"""Minimal server-only PostgREST client for the app_v2 importer tables."""

from __future__ import annotations

import logging
import random
import re
import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

from .config import CANONICAL_SOURCE_NAME, SOURCE_DISPLAY_NAME, SOURCE_DOCS_URL, ImportConfig
from .models import ShelterRecord

logger = logging.getLogger("shelter_importer")
RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}


class SupabaseError(RuntimeError):
    """Safe database error without credentials or response payload dumps."""


class AppV2Store:
    def __init__(
        self,
        config: ImportConfig,
        *,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
        jitter: Callable[[], float] = random.random,
    ) -> None:
        if not config.supabase_url or not config.supabase_secret_key:
            raise ValueError("Supabase configuration is required for write mode")
        self.base_url = config.supabase_url.rstrip("/") + "/rest/v1"
        self.timeout = config.request_timeout
        self.max_attempts = config.max_request_attempts
        self.retry_base_seconds = config.retry_base_seconds
        self.batch_size = config.supabase_batch_size
        self.write_workers = config.supabase_write_workers
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "apikey": config.supabase_secret_key,
                "Authorization": f"Bearer {config.supabase_secret_key}",
                "Content-Type": "application/json",
                "Accept-Profile": "app_v2",
                "Content-Profile": "app_v2",
            }
        )
        self.sleep = sleep
        self.jitter = jitter
        self._municipalities: dict[str, str] | None = None
        self._shelters: dict[str, str] | None = None
        self._written_municipalities: set[str] = set()

    def _request(
        self,
        method: str,
        path: str,
        *,
        operation: str,
        params: dict[str, str] | None = None,
        payload: Any = None,
        prefer: str | None = None,
    ) -> Any:
        headers = {"Prefer": prefer} if prefer else None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self.session.request(
                    method,
                    f"{self.base_url}/{path.lstrip('/')}",
                    params=params,
                    json=payload,
                    headers=headers,
                    timeout=self.timeout,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt == self.max_attempts:
                    raise SupabaseError(
                        f"Supabase {operation} failed after {attempt} network attempts"
                    ) from exc
                self._backoff(operation, attempt, "network failure")
                continue
            except requests.RequestException as exc:
                raise SupabaseError(f"Supabase {operation} request failed") from exc

            if response.status_code in RETRYABLE_STATUSES:
                if attempt == self.max_attempts:
                    raise SupabaseError(
                        f"Supabase {operation} returned HTTP {response.status_code} "
                        f"after {attempt} attempts"
                    )
                self._backoff(operation, attempt, f"HTTP {response.status_code}")
                continue
            if not 200 <= response.status_code < 300:
                detail = ""
                try:
                    body = response.json()
                    code = str(body.get("code", ""))[:40]
                    message = str(body.get("message", ""))[:180]
                    detail = f" ({code}: {message})" if code or message else ""
                except ValueError:
                    pass
                raise SupabaseError(
                    f"Supabase {operation} returned non-retryable HTTP "
                    f"{response.status_code}{detail}"
                )
            if not response.content:
                return None
            try:
                return response.json()
            except ValueError as exc:
                raise SupabaseError(f"Supabase {operation} returned invalid JSON") from exc
        raise AssertionError("unreachable")

    def _backoff(self, operation: str, attempt: int, reason: str) -> None:
        delay = self.retry_base_seconds * (2 ** (attempt - 1)) + self.jitter()
        logger.warning(
            "Retrying Supabase %s after %s (attempt %s/%s)",
            operation,
            reason,
            attempt + 1,
            self.max_attempts,
        )
        self.sleep(delay)

    def _all_rows(
        self, table: str, select: str, params: dict[str, str]
    ) -> Iterator[dict[str, Any]]:
        offset = 0
        limit = 1000
        while True:
            page_params = {**params, "select": select, "offset": str(offset), "limit": str(limit)}
            rows = self._request("GET", table, operation=f"read app_v2.{table}", params=page_params)
            if not isinstance(rows, list):
                raise SupabaseError(f"Supabase app_v2.{table} read returned an invalid shape")
            yield from rows
            if len(rows) < limit:
                break
            offset += limit

    def latest_failed_run(self) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "import_runs",
            operation="load resume checkpoint",
            params={
                "select": (
                    "id,started_at,records_seen,records_upserted,pages_fetched,"
                    "last_successful_page,last_successful_cursor,resumed_from_import_run_id"
                ),
                "source_name": f"eq.{CANONICAL_SOURCE_NAME}",
                "status": "eq.failed",
                "last_successful_page": "not.is.null",
                "order": "started_at.desc",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            return None
        failed = rows[0]
        root_started_at = failed.get("started_at")
        parent_id = failed.get("resumed_from_import_run_id")
        visited = {str(failed.get("id"))}
        while parent_id and str(parent_id) not in visited:
            visited.add(str(parent_id))
            parents = self._request(
                "GET",
                "import_runs",
                operation="load original resume snapshot",
                params={
                    "select": "id,started_at,resumed_from_import_run_id",
                    "id": f"eq.{parent_id}",
                    "limit": "1",
                },
            )
            if not isinstance(parents, list) or not parents or not isinstance(parents[0], dict):
                break
            parent = parents[0]
            root_started_at = parent.get("started_at") or root_started_at
            parent_id = parent.get("resumed_from_import_run_id")
        failed["snapshot_at"] = root_started_at
        return failed

    def create_import_run(
        self,
        *,
        resumed_from: dict[str, Any] | None,
    ) -> dict[str, Any]:
        inherited = resumed_from or {}
        payload = {
            "source_name": CANONICAL_SOURCE_NAME,
            "source_url": SOURCE_DOCS_URL,
            "status": "running",
            "records_seen": int(inherited.get("records_seen") or 0),
            "records_upserted": int(inherited.get("records_upserted") or 0),
            "pages_fetched": int(inherited.get("pages_fetched") or 0),
            "last_successful_page": inherited.get("last_successful_page"),
            "last_successful_cursor": inherited.get("last_successful_cursor"),
            "resumed_from_import_run_id": inherited.get("id"),
            "missing_transitions_applied": False,
            "missing_transitions_skipped_reason": None,
        }
        rows = self._request(
            "POST",
            "import_runs",
            operation="create import run",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(rows, list) or not rows:
            raise SupabaseError("Supabase create import run returned no row")
        row = rows[0]
        if not isinstance(row, dict):
            raise SupabaseError("Supabase create import run returned an invalid row")
        return row

    def checkpoint_import_run(
        self,
        run_id: str,
        *,
        records_seen: int,
        records_upserted: int,
        pages_fetched: int,
        cursor: str | None,
    ) -> None:
        self._request(
            "PATCH",
            "import_runs",
            operation="checkpoint import run",
            params={"id": f"eq.{run_id}", "status": "eq.running"},
            payload={
                "records_seen": records_seen,
                "records_upserted": records_upserted,
                "pages_fetched": pages_fetched,
                "last_successful_page": pages_fetched,
                "last_successful_cursor": cursor,
            },
            prefer="return=minimal",
        )

    def fail_import_run(
        self,
        run_id: str,
        *,
        error_summary: str,
        records_seen: int,
        records_upserted: int,
        pages_fetched: int,
        cursor: str | None,
        finished_at: str,
    ) -> None:
        self._request(
            "PATCH",
            "import_runs",
            operation="fail import run",
            params={"id": f"eq.{run_id}", "status": "eq.running"},
            payload={
                "status": "failed",
                "finished_at": finished_at,
                "error_summary": safe_error_summary(error_summary),
                "records_seen": records_seen,
                "records_upserted": records_upserted,
                "pages_fetched": pages_fetched,
                "last_successful_page": pages_fetched,
                "last_successful_cursor": cursor,
                "missing_transitions_applied": False,
                "missing_transitions_skipped_reason": "run failed before full success",
            },
            prefer="return=minimal",
        )

    def succeed_without_missing(
        self,
        run_id: str,
        *,
        records_seen: int,
        records_upserted: int,
        pages_fetched: int,
        cursor: str | None,
        finished_at: str,
        reason: str,
    ) -> None:
        self._request(
            "PATCH",
            "import_runs",
            operation="complete partial or resumed import run",
            params={"id": f"eq.{run_id}", "status": "eq.running"},
            payload={
                "status": "succeeded",
                "finished_at": finished_at,
                "error_summary": None,
                "records_seen": records_seen,
                "records_upserted": records_upserted,
                "pages_fetched": pages_fetched,
                "last_successful_page": pages_fetched,
                "last_successful_cursor": cursor,
                "missing_transitions_applied": False,
                "missing_transitions_skipped_reason": reason,
            },
            prefer="return=minimal",
        )

    def finalize_full_import(
        self,
        run_id: str,
        *,
        seen_references: set[str],
        records_seen: int,
        records_upserted: int,
        pages_fetched: int,
        cursor: str | None,
        finished_at: str,
    ) -> int:
        result = self._request(
            "POST",
            "rpc/finalize_datafordeler_import",
            operation="atomically finalize full import",
            payload={
                "p_import_run_id": run_id,
                "p_source_name": CANONICAL_SOURCE_NAME,
                "p_seen_references": sorted(seen_references),
                "p_records_seen": records_seen,
                "p_records_upserted": records_upserted,
                "p_pages_fetched": pages_fetched,
                "p_last_successful_cursor": cursor,
                "p_finished_at": finished_at,
            },
        )
        if not isinstance(result, int):
            raise SupabaseError("Supabase full import finalizer returned an invalid result")
        return result

    def preload(self) -> None:
        self._municipalities = {}
        for row in self._all_rows("municipalities", "id,code", {}):
            if row.get("code"):
                self._municipalities[str(row["code"])] = str(row["id"])
        self._shelters = {}
        for row in self._all_rows(
            "shelters",
            "id,canonical_source_reference",
            {"canonical_source_name": f"eq.{CANONICAL_SOURCE_NAME}"},
        ):
            if row.get("canonical_source_reference"):
                self._shelters[str(row["canonical_source_reference"])] = str(row["id"])

    def upsert_records(self, records: list[ShelterRecord], imported_at: str, run_id: str) -> int:
        if self._municipalities is None or self._shelters is None:
            self.preload()
        municipalities: dict[str, str] = {}
        for record in records:
            code = record.municipality.code
            if code not in municipalities:
                municipalities[code] = self._upsert_municipality(record)

        def write_shelter(record: ShelterRecord) -> tuple[ShelterRecord, str]:
            shelter_id = self._upsert_shelter(
                record, municipalities[record.municipality.code], imported_at
            )
            return record, shelter_id

        if self.write_workers == 1:
            written = [write_shelter(record) for record in records]
        else:
            with ThreadPoolExecutor(max_workers=self.write_workers) as executor:
                written = list(executor.map(write_shelter, records))

        self._upsert_sources(written, run_id, imported_at)
        return len(written)

    def _upsert_municipality(self, record: ShelterRecord) -> str:
        assert self._municipalities is not None
        municipality = record.municipality
        existing_id = self._municipalities.get(municipality.code)
        if existing_id and municipality.code in self._written_municipalities:
            return existing_id
        payload = {
            "code": municipality.code,
            "slug": municipality.slug,
            "name": municipality.name,
            "region_name": municipality.region_name,
        }
        if existing_id:
            self._request(
                "PATCH",
                "municipalities",
                operation="update municipality",
                params={"id": f"eq.{existing_id}"},
                payload=payload,
                prefer="return=minimal",
            )
            self._written_municipalities.add(municipality.code)
            return existing_id
        rows = self._request(
            "POST",
            "municipalities",
            operation="insert municipality",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(rows, list) or not rows:
            raise SupabaseError("Supabase municipality insert returned no row")
        municipality_id = str(rows[0]["id"])
        self._municipalities[municipality.code] = municipality_id
        self._written_municipalities.add(municipality.code)
        return municipality_id

    def _upsert_shelter(self, record: ShelterRecord, municipality_id: str, imported_at: str) -> str:
        assert self._shelters is not None
        existing_id = self._shelters.get(record.canonical_source_reference)
        payload = {
            "municipality_id": municipality_id,
            "slug": record.slug,
            "name": record.name,
            "address_line1": record.address_line1,
            "postal_code": record.postal_code,
            "city": record.city,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "capacity": record.capacity,
            "source_application_code": record.source_application_code,
            "status": record.status,
            "accessibility_notes": None,
            "summary": (
                "Importeret fra Datafordeler BBR og DAR. Fysisk og operationel "
                "tilgængelighed er ikke dokumenteret af kilden."
            ),
            "import_state": "active",
            "last_seen_at": imported_at,
            "last_imported_at": imported_at,
            "canonical_source_name": CANONICAL_SOURCE_NAME,
            "canonical_source_reference": record.canonical_source_reference,
        }
        if existing_id:
            self._request(
                "PATCH",
                "shelters",
                operation="update shelter baseline",
                params={"id": f"eq.{existing_id}"},
                payload=payload,
                prefer="return=minimal",
            )
            return existing_id
        rows = self._request(
            "POST",
            "shelters",
            operation="insert shelter baseline",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(rows, list) or not rows:
            raise SupabaseError("Supabase shelter insert returned no row")
        shelter_id = str(rows[0]["id"])
        self._shelters[record.canonical_source_reference] = shelter_id
        return shelter_id

    def _upsert_sources(
        self,
        written: list[tuple[ShelterRecord, str]],
        run_id: str,
        imported_at: str,
    ) -> None:
        payload = [
            {
                "shelter_id": shelter_id,
                "import_run_id": run_id,
                "source_name": SOURCE_DISPLAY_NAME,
                "source_url": SOURCE_DOCS_URL,
                "source_type": "official",
                "source_reference": record.canonical_source_reference,
                "last_verified_at": imported_at,
                "imported_at": imported_at,
                "notes": "BBR building enriched through DAR v3",
            }
            for record, shelter_id in written
        ]
        self._request(
            "POST",
            "shelter_sources",
            operation="upsert shelter source",
            params={"on_conflict": "shelter_id,source_name,source_reference"},
            payload=payload,
            prefer="resolution=merge-duplicates,return=minimal",
        )


def safe_error_summary(value: str) -> str:
    sanitized = re.sub(
        r"(?i)(apikey|api_key|token|secret|authorization)=?[^\s&]*",
        r"\1=<redacted>",
        value,
    )
    sanitized = re.sub(r"https?://[^\s?]+\?[^\s]+", "<url-with-query-redacted>", sanitized)
    return sanitized.replace("\n", " ")[:500]
