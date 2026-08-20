from __future__ import annotations

from typing import Any

from shelter_importer.models import Municipality, ShelterRecord


def shelter(reference: str = "building-1") -> ShelterRecord:
    return ShelterRecord(
        municipality=Municipality("0101", "kobenhavn", "København"),
        canonical_source_reference=reference,
        slug=f"kobenhavn-testvej-1-{reference}",
        name="Beskyttelsesrum ved Testvej 1",
        address_line1="Testvej 1",
        postal_code="1000",
        city="København K",
        latitude=55.6761,
        longitude=12.5683,
        capacity=42,
        source_application_code="390",
    )


class Response:
    def __init__(self, status: int, payload: Any = None) -> None:
        self.status_code = status
        self._payload = payload
        self.content = b"" if payload is None else b"json"

    def json(self) -> Any:
        return self._payload


class QueueSession:
    def __init__(self, responses: list[Response]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []
        self.headers: dict[str, str] = {}

    def post(self, url: str, **kwargs: Any) -> Response:
        self.calls.append({"method": "POST", "url": url, **kwargs})
        return self.responses.pop(0)

    def request(self, method: str, url: str, **kwargs: Any) -> Response:
        self.calls.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)
