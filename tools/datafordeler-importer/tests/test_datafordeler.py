from __future__ import annotations

from typing import Any

import pytest
from conftest import QueueSession, Response

from shelter_importer.config import BBR_GRAPHQL_URL, DAR_GRAPHQL_URL, ImportConfig
from shelter_importer.datafordeler import (
    BBR_QUERY,
    DAR_HOUSE_NUMBER_QUERY,
    DAR_POSTAL_QUERY,
    DAR_ROAD_QUERY,
    DatafordelerError,
    DatafordelerSource,
    GraphqlClient,
)


def config() -> ImportConfig:
    return ImportConfig("secret", None, None, page_size=2, retry_base_seconds=0.01)


def test_current_endpoint_urls_and_schema_field_names() -> None:
    assert BBR_GRAPHQL_URL == "https://graphql.datafordeler.dk/BBR/v3"
    assert DAR_GRAPHQL_URL == "https://graphql.datafordeler.dk/DAR/v3"
    assert "/v1" not in BBR_QUERY + DAR_HOUSE_NUMBER_QUERY + DAR_ROAD_QUERY + DAR_POSTAL_QUERY
    for field in (
        "kommunekode",
        "husnummer",
        "byg021BygningensAnvendelse",
        "byg069Sikringsrumpladser",
        "byg404Koordinat",
    ):
        assert field in BBR_QUERY


def test_retry_is_bounded_for_5xx_and_not_used_for_4xx() -> None:
    session = QueueSession([Response(503), Response(200, {"data": {"ok": True}})])
    client = GraphqlClient(
        BBR_GRAPHQL_URL,
        "secret",
        timeout=1,
        max_attempts=4,
        retry_base_seconds=0.01,
        session=session,  # type: ignore[arg-type]
        sleep=lambda _: None,
        jitter=lambda: 0,
    )
    assert client.query("Test", "query Test { ok }", {}) == {"ok": True}
    assert len(session.calls) == 2
    assert session.calls[0]["params"] == {"apiKey": "secret"}

    bad = QueueSession([Response(404)])
    client.session = bad  # type: ignore[assignment]
    with pytest.raises(DatafordelerError, match="non-retryable HTTP 404"):
        client.query("Test", "query Test { ok }", {})
    assert len(bad.calls) == 1


class FakeClient:
    def __init__(self, payloads: dict[str, list[dict[str, Any]]]) -> None:
        self.payloads = payloads
        self.statuses_seen = {200}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def query(self, operation: str, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((operation, variables))
        return self.payloads[operation].pop(0)


def connection(
    root: str, nodes: list[dict[str, Any]], next_cursor: str | None = None
) -> dict[str, Any]:
    return {
        root: {
            "nodes": nodes,
            "pageInfo": {"hasNextPage": next_cursor is not None, "endCursor": next_cursor},
        }
    }


def test_graphql_mapping_links_bbr_dar_and_maps_coordinates_and_application_code() -> None:
    bbr = FakeClient(
        {
            "FetchBbrShelters": [
                connection(
                    "BBR_Bygning",
                    [
                        {
                            "id_lokalId": "building-1",
                            "kommunekode": "0101",
                            "status": "6",
                            "husnummer": "house-1",
                            "byg007Bygningsnummer": 1,
                            "byg021BygningensAnvendelse": "390",
                            "byg069Sikringsrumpladser": 42,
                            "byg404Koordinat": {"wkt": "POINT (724000 6176000)"},
                        }
                    ],
                )
            ]
        }
    )
    dar = FakeClient(
        {
            "FetchDarHouseNumbers": [
                connection(
                    "DAR_Husnummer",
                    [
                        {
                            "id_lokalId": "house-1",
                            "status": "3",
                            "husnummertekst": "1",
                            "navngivenVej": "road-1",
                            "postnummer": "postal-1",
                        }
                    ],
                )
            ],
            "FetchDarRoads": [
                connection("DAR_NavngivenVej", [{"id_lokalId": "road-1", "vejnavn": "Testvej"}])
            ],
            "FetchDarPostalCodes": [
                connection(
                    "DAR_Postnummer",
                    [{"id_lokalId": "postal-1", "postnr": "1000", "navn": "København K"}],
                )
            ],
        }
    )
    source = DatafordelerSource(config(), bbr_client=bbr, dar_client=dar)  # type: ignore[arg-type]
    page = next(source.pages(snapshot_at="2026-07-13T12:00:00Z"))
    assert len(page.records) == 1
    record = page.records[0]
    assert record.canonical_source_reference == "building-1"
    assert record.municipality.code == "0101"
    assert record.address_line1 == "Testvej 1"
    assert record.capacity == 42
    assert record.source_application_code == "390"
    assert record.status == "under_review"
    assert record.latitude is not None and record.longitude is not None


def test_bbr_cursor_pagination_is_deterministic() -> None:
    bbr = FakeClient(
        {
            "FetchBbrShelters": [
                connection("BBR_Bygning", [], "cursor-1"),
                connection("BBR_Bygning", []),
            ]
        }
    )
    dar = FakeClient({})
    source = DatafordelerSource(config(), bbr_client=bbr, dar_client=dar)  # type: ignore[arg-type]
    pages = list(source.pages(snapshot_at="fixed", after=None))
    assert len(pages) == 1
    assert pages[0].source_pages == 2
    assert bbr.calls[0][1]["after"] is None
    assert bbr.calls[1][1]["after"] == "cursor-1"
    assert all(call[1]["registreringstid"] == "fixed" for call in bbr.calls)
