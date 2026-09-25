import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  convertUtm32ToWgs84,
  dedupeAddressSuggestions,
  parseAddressSuggestion,
  parseResolvedAddress,
  resolveAddress,
  searchAddresses,
  type AddressSuggestion,
} from "../src/lib/address/adressevaelger";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(body: unknown, status = 200) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return urls;
}

// Rådhuspladsen 1, 1550 København V: DAWA returned 12.56957768, 55.6756275 for the same access point.
const raadhuspladsenDetail = {
  status: "ok",
  husnummer: {
    adgangsadressebetegnelse: "Rådhuspladsen 1, 1550 København V",
    adgangspunkt: { koordinater: { x: 724434.93, y: 6175755.61 } },
  },
};

test("UTM zone 32 access points convert to the same WGS84 position DAWA returned", async () => {
  const { latitude, longitude } = await convertUtm32ToWgs84(724434.93, 6175755.61);
  assert.ok(Math.abs(latitude - 55.6756275) < 1e-6, `latitude ${latitude}`);
  assert.ok(Math.abs(longitude - 12.56957768) < 1e-6, `longitude ${longitude}`);
});

test("search results are parsed into streets and addresses and deduplicated", async () => {
  const urls = mockFetch({
    status: "ok",
    beskrivelse: "",
    fund: [
      { type: "vejnavn", titel: "Rådhus Allé", vejNavn: "Rådhus Allé" },
      { type: "vejnavn", titel: "rådhus allé" },
      {
        type: "navngivenvejpostnummer",
        id: "83a1b9a3-185d-4596-ad9a-e7587dd14474",
        titel: "Rådhuspladsen 1550 København V",
        vejnavn: "Rådhuspladsen",
        postnr: "1550",
        postdistrikt: "København V",
      },
      { type: "husnummer", id: "0a3f507a-ec01-32b8-e044-0003ba298018", titel: "Rådhuspladsen 1, 1550 København V" },
      { type: "husnummer", id: "0a3f507a-ec01-32b8-e044-0003ba298018", titel: "Rådhuspladsen 1, 1550 København V" },
      { type: "ukendt", titel: "Ignoreres" },
      { type: "husnummer", titel: "Uden id" },
    ],
  });

  const results = await searchAddresses("  Rådhus  ", { limit: 5 });

  assert.deepEqual(results, [
    { kind: "street", label: "Rådhus Allé", refineText: "Rådhus Allé ", caret: 12 },
    {
      kind: "street",
      label: "Rådhuspladsen 1550 København V",
      refineText: "Rådhuspladsen , 1550 København V",
      caret: 14,
    },
    { kind: "address", id: "0a3f507a-ec01-32b8-e044-0003ba298018", label: "Rådhuspladsen 1, 1550 København V" },
  ]);
  const url = new URL(urls[0]);
  assert.equal(url.origin, "https://adressevaelger.dk");
  assert.equal(url.pathname, "/husnumre/soeg");
  assert.equal(url.searchParams.get("tekst"), "Rådhus");
  assert.equal(url.searchParams.get("token"), "adressevaelger123");
});

test("short queries never call the address service", async () => {
  const urls = mockFetch({ status: "ok", fund: [] });
  assert.deepEqual(await searchAddresses(" a "), []);
  assert.equal(urls.length, 0);
});

test("functional errors reported with HTTP 200 are treated as failures", async () => {
  mockFetch({ status: "fejl", beskrivelse: "Ugyldig token" });
  await assert.rejects(searchAddresses("Rådhuspladsen"), /error response/);
});

test("HTTP errors are treated as failures", async () => {
  mockFetch({}, 503);
  await assert.rejects(searchAddresses("Rådhuspladsen"), /status 503/);
});

test("a selected address resolves to WGS84 coordinates and its official label", async () => {
  const urls = mockFetch(raadhuspladsenDetail);
  const suggestion = { kind: "address", id: "0a3f507a-ec01-32b8-e044-0003ba298018", label: "Rådhuspladsen 1" } as const;

  const resolved = await resolveAddress(suggestion);

  assert.equal(resolved.label, "Rådhuspladsen 1, 1550 København V");
  assert.ok(Math.abs(resolved.latitude - 55.6756275) < 1e-6);
  assert.ok(Math.abs(resolved.longitude - 12.56957768) < 1e-6);
  assert.equal(new URL(urls[0]).pathname, "/husnumre/0a3f507a-ec01-32b8-e044-0003ba298018");
});

test("addresses without coordinates or outside Denmark are rejected", async () => {
  await assert.rejects(parseResolvedAddress({ status: "ok", husnummer: {} }, "x"), /no access point/);
  await assert.rejects(
    parseResolvedAddress({ status: "ok", husnummer: { adgangspunkt: { koordinater: { x: 500000, y: 1000000 } } } }, "x"),
    /outside Denmark/,
  );
});

test("suggestion parsing and dedupe are strict", () => {
  assert.equal(parseAddressSuggestion(null), null);
  assert.equal(parseAddressSuggestion({ type: "husnummer", titel: "  " , id: "a" }), null);
  const suggestions: AddressSuggestion[] = [
    { kind: "address", id: "a", label: "A 1" },
    { kind: "address", id: "b", label: "B 1" },
    { kind: "address", id: "c", label: "C 1" },
  ];
  assert.equal(dedupeAddressSuggestions(suggestions, 2).length, 2);
});
