"""Datafordeler GraphQL v3 client and BBR/DAR response mapping."""

from __future__ import annotations

import logging
import random
import re
import time
import unicodedata
from collections.abc import Callable, Iterator
from typing import Any

import requests
from pyproj import Transformer

from .config import BBR_GRAPHQL_URL, DAR_GRAPHQL_URL, ImportConfig
from .models import PageResult, ShelterRecord
from .municipalities import municipality_for

logger = logging.getLogger("shelter_importer")

RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}
BBR_STATUS_IN_USE = "6"
DAR_STATUS_CURRENT = "3"

BBR_QUERY = """
query FetchBbrShelters(
  $first: Int!, $after: String, $registreringstid: DafDateTime,
  $virkningstid: DafDateTime
) {
  BBR_Bygning(
    first: $first, after: $after,
    registreringstid: $registreringstid, virkningstid: $virkningstid,
    where: { status: { eq: "6" } }
  ) {
    nodes {
      id_lokalId
      kommunekode
      status
      husnummer
      byg007Bygningsnummer
      byg021BygningensAnvendelse
      byg069Sikringsrumpladser
      byg404Koordinat { wkt }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"""

DAR_HOUSE_NUMBER_QUERY = """
query FetchDarHouseNumbers(
  $first: Int!, $after: String, $ids: [String!],
  $registreringstid: DafDateTime, $virkningstid: DafDateTime
) {
  DAR_Husnummer(
    first: $first, after: $after,
    registreringstid: $registreringstid, virkningstid: $virkningstid,
    where: { id_lokalId: { in: $ids } }
  ) {
    nodes { id_lokalId status husnummertekst navngivenVej postnummer }
    pageInfo { hasNextPage endCursor }
  }
}
"""

DAR_ROAD_QUERY = """
query FetchDarRoads(
  $first: Int!, $after: String, $ids: [String!],
  $registreringstid: DafDateTime, $virkningstid: DafDateTime
) {
  DAR_NavngivenVej(
    first: $first, after: $after,
    registreringstid: $registreringstid, virkningstid: $virkningstid,
    where: { id_lokalId: { in: $ids } }
  ) {
    nodes { id_lokalId vejnavn }
    pageInfo { hasNextPage endCursor }
  }
}
"""

DAR_POSTAL_QUERY = """
query FetchDarPostalCodes(
  $first: Int!, $after: String, $ids: [String!],
  $registreringstid: DafDateTime, $virkningstid: DafDateTime
) {
  DAR_Postnummer(
    first: $first, after: $after,
    registreringstid: $registreringstid, virkningstid: $virkningstid,
    where: { id_lokalId: { in: $ids } }
  ) {
    nodes { id_lokalId postnr navn }
    pageInfo { hasNextPage endCursor }
  }
}
"""


class DatafordelerError(RuntimeError):
    """Safe upstream error that never contains the API key."""


class GraphqlClient:
    def __init__(
        self,
        endpoint: str,
        api_key: str,
        *,
        timeout: float,
        max_attempts: int,
        retry_base_seconds: float,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
        jitter: Callable[[], float] = random.random,
    ) -> None:
        self.endpoint = endpoint
        self._api_key = api_key
        self.timeout = timeout
        self.max_attempts = max_attempts
        self.retry_base_seconds = retry_base_seconds
        self.session = session or requests.Session()
        self.sleep = sleep
        self.jitter = jitter
        self.statuses_seen: set[int] = set()

    def query(self, operation_name: str, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self.session.post(
                    self.endpoint,
                    params={"apiKey": self._api_key},
                    headers={"content-type": "application/json"},
                    json={
                        "operationName": operation_name,
                        "query": query,
                        "variables": variables,
                    },
                    timeout=self.timeout,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt == self.max_attempts:
                    raise DatafordelerError(
                        f"Datafordeler network failure in {operation_name} after {attempt} attempts"
                    ) from exc
                self._backoff(operation_name, attempt, "network failure")
                continue
            except requests.RequestException as exc:
                raise DatafordelerError(
                    f"Datafordeler request failure in {operation_name}"
                ) from exc

            self.statuses_seen.add(response.status_code)
            if response.status_code in RETRYABLE_STATUSES:
                if attempt == self.max_attempts:
                    raise DatafordelerError(
                        f"Datafordeler {operation_name} returned HTTP {response.status_code} "
                        f"after {attempt} attempts"
                    )
                self._backoff(operation_name, attempt, f"HTTP {response.status_code}")
                continue
            if not 200 <= response.status_code < 300:
                raise DatafordelerError(
                    f"Datafordeler {operation_name} returned non-retryable HTTP "
                    f"{response.status_code}"
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise DatafordelerError(
                    f"Datafordeler {operation_name} returned invalid JSON"
                ) from exc
            if payload.get("errors"):
                messages = [
                    str(error.get("message", "GraphQL schema error"))[:300]
                    for error in payload["errors"][:3]
                ]
                raise DatafordelerError(
                    f"Datafordeler GraphQL error in {operation_name}: {'; '.join(messages)}"
                )
            data = payload.get("data")
            if not isinstance(data, dict):
                raise DatafordelerError(
                    f"Datafordeler {operation_name} response did not contain data"
                )
            return data
        raise AssertionError("unreachable")

    def _backoff(self, operation_name: str, attempt: int, reason: str) -> None:
        delay = self.retry_base_seconds * (2 ** (attempt - 1)) + self.jitter()
        logger.warning(
            "Retrying %s after %s (attempt %s/%s)",
            operation_name,
            reason,
            attempt + 1,
            self.max_attempts,
        )
        self.sleep(delay)


class DatafordelerSource:
    def __init__(
        self,
        config: ImportConfig,
        *,
        bbr_client: GraphqlClient | None = None,
        dar_client: GraphqlClient | None = None,
    ) -> None:
        self.config = config
        self.bbr = bbr_client or GraphqlClient(
            BBR_GRAPHQL_URL,
            config.datafordeler_api_key,
            timeout=config.request_timeout,
            max_attempts=config.max_request_attempts,
            retry_base_seconds=config.retry_base_seconds,
        )
        self.dar = dar_client or GraphqlClient(
            DAR_GRAPHQL_URL,
            config.datafordeler_api_key,
            timeout=config.request_timeout,
            max_attempts=config.max_request_attempts,
            retry_base_seconds=config.retry_base_seconds,
        )
        self._transformer = Transformer.from_crs("EPSG:25832", "EPSG:4326", always_xy=True)

    @property
    def statuses_seen(self) -> set[int]:
        return self.bbr.statuses_seen | self.dar.statuses_seen

    def pages(
        self,
        *,
        snapshot_at: str,
        after: str | None = None,
        start_page: int = 0,
        max_pages: int | None = None,
    ) -> Iterator[PageResult]:
        page_number = start_page
        grouped_nodes: list[dict[str, Any]] = []
        grouped_source_pages = 0
        while True:
            data = self.bbr.query(
                "FetchBbrShelters",
                BBR_QUERY,
                {
                    "first": self.config.page_size,
                    "after": after,
                    "registreringstid": snapshot_at,
                    "virkningstid": snapshot_at,
                },
            )
            connection = _connection(data, "BBR_Bygning")
            nodes = connection["nodes"]
            info = connection["pageInfo"]
            page_number += 1
            grouped_nodes.extend(nodes)
            grouped_source_pages += 1
            source_exhausted = not info.get("hasNextPage")
            cap_reached = max_pages is not None and page_number >= max_pages
            eligible_count = sum(1 for node in grouped_nodes if _eligible_bbr_node(node))

            # BBR v3 cannot filter on byg069. Group sparse candidates so DAR relation
            # lookups remain batched, while the checkpoint still advances atomically.
            if eligible_count >= self.config.dar_batch_size or source_exhausted or cap_reached:
                records, warnings, dar_missing_count, mapping_failure_count = (
                    self._map_bbr_page(grouped_nodes, snapshot_at)
                )
                yield PageResult(
                    records=records,
                    end_cursor=info.get("endCursor"),
                    has_next_page=bool(info.get("hasNextPage")),
                    fetched_bbr_records=len(grouped_nodes),
                    eligible_bbr_records=eligible_count,
                    dar_missing_records=dar_missing_count,
                    mapping_failure_records=mapping_failure_count,
                    warnings=warnings,
                    source_pages=grouped_source_pages,
                )
                grouped_nodes = []
                grouped_source_pages = 0

            if source_exhausted or cap_reached:
                break
            next_cursor = info.get("endCursor")
            if not next_cursor or next_cursor == after:
                raise DatafordelerError("BBR pagination did not advance its cursor")
            after = next_cursor

    def _map_bbr_page(
        self, nodes: list[dict[str, Any]], snapshot_at: str
    ) -> tuple[list[ShelterRecord], list[str], int, int]:
        warnings: list[str] = []
        dar_missing_count = 0
        mapping_failure_count = 0
        eligible = [node for node in nodes if _eligible_bbr_node(node)]

        house_ids = _unique(str(node["husnummer"]) for node in eligible)
        houses = self._lookup(
            "DAR_Husnummer",
            "FetchDarHouseNumbers",
            DAR_HOUSE_NUMBER_QUERY,
            house_ids,
            snapshot_at,
        )
        road_ids = _unique(
            str(row["navngivenVej"]) for row in houses.values() if row.get("navngivenVej")
        )
        postal_ids = _unique(
            str(row["postnummer"]) for row in houses.values() if row.get("postnummer")
        )
        roads = self._lookup(
            "DAR_NavngivenVej",
            "FetchDarRoads",
            DAR_ROAD_QUERY,
            road_ids,
            snapshot_at,
        )
        postals = self._lookup(
            "DAR_Postnummer",
            "FetchDarPostalCodes",
            DAR_POSTAL_QUERY,
            postal_ids,
            snapshot_at,
        )

        records: list[ShelterRecord] = []
        for node in eligible:
            reference = str(node["id_lokalId"])
            house = houses.get(str(node["husnummer"]))
            if not house or house.get("status") != DAR_STATUS_CURRENT:
                warnings.append(f"{reference}: no current DAR house number")
                dar_missing_count += 1
                continue
            road = roads.get(str(house.get("navngivenVej")))
            postal = postals.get(str(house.get("postnummer")))
            road_name = _text(road, "vejnavn")
            house_number = _text(house, "husnummertekst")
            postal_code = _text(postal, "postnr")
            city = _text(postal, "navn")
            municipality_code = str(node.get("kommunekode") or "").zfill(4)
            capacity = _positive_int(node.get("byg069Sikringsrumpladser"))
            if not all((road_name, house_number, postal_code, city, municipality_code, capacity)):
                warnings.append(f"{reference}: incomplete BBR/DAR mapping")
                mapping_failure_count += 1
                continue
            assert capacity is not None
            address = f"{road_name} {house_number}"
            municipality = municipality_for(municipality_code)
            latitude, longitude = self._coordinates(node.get("byg404Koordinat"))
            ref_part = _slug(reference)[-12:]
            slug = f"{municipality.slug}-{_slug(address)}-{ref_part}"[:160].strip("-")
            records.append(
                ShelterRecord(
                    municipality=municipality,
                    canonical_source_reference=reference,
                    slug=slug,
                    name=f"Beskyttelsesrum ved {address}",
                    address_line1=address,
                    postal_code=postal_code,
                    city=city,
                    latitude=latitude,
                    longitude=longitude,
                    capacity=capacity,
                    source_application_code=(
                        str(node["byg021BygningensAnvendelse"])
                        if node.get("byg021BygningensAnvendelse") is not None
                        else None
                    ),
                )
            )
        return records, warnings, dar_missing_count, mapping_failure_count

    def _lookup(
        self,
        root: str,
        operation: str,
        query: str,
        ids: list[str],
        snapshot_at: str,
    ) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for batch in _chunks(ids, self.config.dar_batch_size):
            after: str | None = None
            while batch:
                data = self.dar.query(
                    operation,
                    query,
                    {
                        "first": min(1000, len(batch)),
                        "after": after,
                        "ids": batch,
                        "registreringstid": snapshot_at,
                        "virkningstid": snapshot_at,
                    },
                )
                connection = _connection(data, root)
                for node in connection["nodes"]:
                    local_id = node.get("id_lokalId")
                    if local_id:
                        result[str(local_id)] = node
                info = connection["pageInfo"]
                if not info.get("hasNextPage"):
                    break
                next_cursor = info.get("endCursor")
                if not next_cursor or next_cursor == after:
                    raise DatafordelerError(f"{root} pagination did not advance its cursor")
                after = next_cursor
        return result

    def _coordinates(self, value: Any) -> tuple[float | None, float | None]:
        wkt = value.get("wkt") if isinstance(value, dict) else None
        if not isinstance(wkt, str):
            return None, None
        match = re.fullmatch(r"\s*POINT\s*\(\s*([0-9.+-]+)\s+([0-9.+-]+)\s*\)\s*", wkt, re.I)
        if not match:
            return None, None
        longitude, latitude = self._transformer.transform(
            float(match.group(1)), float(match.group(2))
        )
        return round(latitude, 6), round(longitude, 6)


def _connection(data: dict[str, Any], root: str) -> dict[str, Any]:
    value = data.get(root)
    if not isinstance(value, dict):
        raise DatafordelerError(f"GraphQL response did not contain {root}")
    nodes = value.get("nodes")
    page_info = value.get("pageInfo")
    if not isinstance(nodes, list) or not isinstance(page_info, dict):
        raise DatafordelerError(f"GraphQL response for {root} had an invalid connection shape")
    return value


def _positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _eligible_bbr_node(node: dict[str, Any]) -> bool:
    return bool(
        node.get("status") == BBR_STATUS_IN_USE
        and _positive_int(node.get("byg069Sikringsrumpladser"))
        and node.get("husnummer")
        and node.get("id_lokalId")
    )


def _text(value: dict[str, Any] | None, key: str) -> str:
    if not value or value.get(key) is None:
        return ""
    return str(value[key]).strip()


def _slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def _unique(values: Any) -> list[str]:
    return list(dict.fromkeys(values))


def _chunks(values: list[str], size: int) -> Iterator[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]
