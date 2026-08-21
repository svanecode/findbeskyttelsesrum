"""Minimal server-only PostgREST client for the app_v2 importer tables."""

from __future__ import annotations

import logging
import random
import re
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from .config import CANONICAL_SOURCE_NAME, SOURCE_DOCS_URL, ImportConfig
from .models import ShelterRecord

logger = logging.getLogger("shelter_importer")
RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}


class SupabaseError(RuntimeError):
    """Safe database error without credentials or response payload dumps."""


class PublicationRejectedError(SupabaseError):
    """The complete staged dataset did not pass the database quality gates."""

    def __init__(self, result: dict[str, Any]) -> None:
        raw_reasons = result.get("qualityGateReasons")
        reasons = [str(value) for value in raw_reasons] if isinstance(raw_reasons, list) else []
        self.result = result
        self.reasons = reasons
        detail = "; ".join(reasons) if reasons else "unknown quality gate"
        super().__init__(f"Dataset publication rejected: {detail}")


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

    def latest_failed_run(self) -> dict[str, Any] | None:
        resume_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
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
                "finished_at": f"gte.{resume_cutoff}",
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
        self._request(
            "POST",
            "rpc/prune_datafordeler_import_candidates_v1",
            operation="prune stale staging candidates",
            payload={},
        )
        payload: dict[str, Any] = {
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
            "publication_status": "staging",
            "quality_gate_passed": None,
            "quality_gate_reasons": [],
            "quality_metrics": {},
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
        if resumed_from:
            self._request(
                "POST",
                "rpc/copy_datafordeler_import_candidates_v1",
                operation="copy staged resume candidates",
                payload={
                    "p_from_import_run_id": str(resumed_from["id"]),
                    "p_to_import_run_id": str(row["id"]),
                },
            )
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
                "publication_status": "not_published",
                "quality_gate_passed": None,
            },
            prefer="return=minimal",
        )
        self._request(
            "DELETE",
            "import_shelter_candidates",
            operation="discard unpublished staging rows",
            params={"import_run_id": f"eq.{run_id}"},
            prefer="return=minimal",
        )

    def publish_full_import(
        self,
        run_id: str,
        *,
        records_seen: int,
        records_staged: int,
        pages_fetched: int,
        cursor: str | None,
        finished_at: str,
    ) -> dict[str, Any]:
        result = self._request(
            "POST",
            "rpc/publish_datafordeler_import_v2",
            operation="validate and atomically publish full import",
            payload={
                "p_import_run_id": run_id,
                "p_source_name": CANONICAL_SOURCE_NAME,
                "p_records_seen": records_seen,
                "p_records_staged": records_staged,
                "p_pages_fetched": pages_fetched,
                "p_last_successful_cursor": cursor,
                "p_finished_at": finished_at,
            },
        )
        if not isinstance(result, dict) or result.get("status") not in {"published", "rejected"}:
            raise SupabaseError("Supabase publication function returned an invalid result")
        if result["status"] == "rejected":
            raise PublicationRejectedError(result)
        return result

    def stage_records(self, records: list[ShelterRecord], run_id: str) -> int:
        payload = [
            {
                "import_run_id": run_id,
                "source_name": CANONICAL_SOURCE_NAME,
                "canonical_source_reference": record.canonical_source_reference,
                "municipality_code": record.municipality.code,
                "municipality_slug": record.municipality.slug,
                "municipality_name": record.municipality.name,
                "municipality_region_name": record.municipality.region_name,
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
            }
            for record in records
        ]
        for start in range(0, len(payload), self.batch_size):
            self._request(
                "POST",
                "import_shelter_candidates",
                operation="stage shelter candidates",
                params={"on_conflict": "import_run_id,canonical_source_reference"},
                payload=payload[start : start + self.batch_size],
                prefer="resolution=merge-duplicates,return=minimal",
            )
        return len(payload)


def safe_error_summary(value: str) -> str:
    sanitized = re.sub(
        r"(?i)(apikey|api_key|token|secret|authorization)=?[^\s&]*",
        r"\1=<redacted>",
        value,
    )
    sanitized = re.sub(r"https?://[^\s?]+\?[^\s]+", "<url-with-query-redacted>", sanitized)
    return sanitized.replace("\n", " ")[:500]
