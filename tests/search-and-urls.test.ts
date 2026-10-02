import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { pickUnambiguousSuggestion, searchAddresses, type AddressSuggestion } from "../src/lib/address/adressevaelger";
import { alternateAaSpelling, matchPlace, normalizePlaceText, parseLocality, type PostalAreaTable } from "../src/lib/address/locality";
import { filterMunicipalityGroups, getMunicipalitySearchPath, parseMunicipalitySearchQuery } from "../src/lib/municipalities/search";
import { parseOfflineCopyRecord } from "../src/lib/offline-copy";
import {
  getCanonicalShelterSlug,
  getCanonicalShelterSlugs,
  getReadableGroupPaths,
  getReadableShelterPathFromStable,
  readableSlugPostcodes,
  readableSlugShortId,
  slugifyDanish,
} from "../src/lib/shelter-public-url";

const table: PostalAreaTable = {
  postnumre: [
    ["1550", "København V", ["0101"], 55.676, 12.567],
    ["1620", "København V", ["0101"], 55.672, 12.554],
    ["2100", "København Ø", ["0101"], 55.706, 12.571],
    ["8000", "Aarhus C", ["0751"], 56.154, 10.202],
    ["8200", "Aarhus N", ["0751"], 56.189, 10.188],
    ["8382", "Hinnerup", ["0710"], 56.256, 10.072],
  ],
  kommuner: [["0101", "København"], ["0751", "Aarhus"], ["0710", "Favrskov"]],
};

test("place text treats aa and å alike and ignores punctuation", () => {
  assert.equal(normalizePlaceText(" Banegaardspladsen 1,  Aarhus "), "banegårdspladsen 1 århus");
  assert.equal(alternateAaSpelling("Banegaardspladsen"), "Banegårdspladsen");
  assert.equal(alternateAaSpelling("Banegårdspladsen"), "Banegaardspladsen");
  assert.equal(alternateAaSpelling("Vesterbrogade"), null);
});

test("town names and postcodes map to municipality codes and areas", () => {
  assert.deepEqual(matchPlace("Aarhus", table)?.codes, ["0751"]);
  assert.deepEqual(matchPlace("København", table)?.codes, ["0101"]);
  assert.deepEqual(matchPlace("Hinnerup", table)?.codes, ["0710"]);
  assert.deepEqual(matchPlace("8000", table)?.areas.map((area) => area.postnr), ["8000"]);
  assert.equal(matchPlace("Vesterbrogade", table), null);
});

test("the street and the town are split with and without a comma", () => {
  assert.deepEqual(parseLocality("Banegårdspladsen 1, Aarhus", table), {
    street: "Banegårdspladsen 1",
    municipalityCodes: ["0751"],
    placeKey: "århus",
    areas: [],
  });
  assert.equal(parseLocality("Banegaardspladsen 1 Aarhus", table)?.street, "Banegaardspladsen 1");
  assert.equal(parseLocality("Nørre Allé 5 Aarhus N", table)?.placeKey, "århus n");
  // A trailing postcode is left to Adressevælger, which already understands it.
  assert.equal(parseLocality("Rådhuspladsen 2, 8000", table), null);
  assert.equal(parseLocality("8000", table)?.street, "");
  assert.equal(parseLocality("Vesterbrogade 10", table), null);
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockAdressevaelger(handler: (url: URL) => Array<Record<string, unknown>>) {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    urls.push(url);
    return new Response(JSON.stringify({ status: "ok", fund: handler(url) }), { status: 200 });
  }) as typeof fetch;
  return urls;
}

const address = (titel: string, id = titel) => ({ type: "husnummer", id, titel });

test("a town after the street filters by municipality and ranks the town first (A3)", async () => {
  const urls = mockAdressevaelger((url) => url.searchParams.get("kommunekode") === "0751"
    ? [address("Banegårdspladsen 1, 8000 Aarhus C"), address("Banegårdspladsen 1A, 8000 Aarhus C")]
    : [address("Banegårdspladsen 1, 1570 København V"), address("Banegårdspladsen 1, 2750 Ballerup")]);

  const results = await searchAddresses("Banegaardspladsen 1 Aarhus", { limit: 5 });

  assert.equal(results[0]?.label, "Banegårdspladsen 1, 8000 Aarhus C");
  const filtered = urls.find((url) => url.searchParams.has("kommunekode"));
  assert.equal(filtered?.searchParams.get("tekst"), "Banegaardspladsen 1");
});

test("a bare postcode is offered as an area (A3)", async () => {
  mockAdressevaelger(() => []);
  const results = await searchAddresses("8000", { limit: 5 });
  assert.deepEqual(results[0], { kind: "area", id: "8000", label: "8000 Aarhus C", latitude: 56.1544, longitude: 10.2017 });
});

test("free text takes a suggestion only when it is unambiguous (A2)", () => {
  const one: AddressSuggestion[] = [{ kind: "address", id: "a", label: "Rådhuspladsen 2, 8000 Aarhus C" }];
  assert.equal(pickUnambiguousSuggestion("Rådhuspladsen 2, 8000", one)?.label, "Rådhuspladsen 2, 8000 Aarhus C");

  const many: AddressSuggestion[] = [
    { kind: "address", id: "a", label: "Rådhuspladsen 1, 1550 København V" },
    { kind: "address", id: "b", label: "Rådhuspladsen 1, 8000 Aarhus C" },
  ];
  assert.equal(pickUnambiguousSuggestion("Rådhuspladsen 1", many), null);
  assert.equal(pickUnambiguousSuggestion("raadhuspladsen 1, 8000 aarhus c", many)?.id, "b");

  const street: AddressSuggestion[] = [{ kind: "street", label: "Nørrebrogade", refineText: "Nørrebrogade ", caret: 13 }];
  assert.equal(pickUnambiguousSuggestion("Nørrebrogade", street), null);
});

test("municipality search covers every address and survives in the URL (A1)", () => {
  const groups = Array.from({ length: 500 }, (_, index) => ({
    addressLine1: index === 420 ? "Agerøvej 7" : `Vej ${index}`,
    postalCode: "8000",
    city: "Aarhus C",
    applicationCodeLabels: [],
  }));
  assert.deepEqual(filterMunicipalityGroups(groups, "agerøvej").map((group) => group.addressLine1), ["Agerøvej 7"]);
  assert.deepEqual(filterMunicipalityGroups(groups, "Agerøvej 7 8000").length, 1);
  assert.equal(parseMunicipalitySearchQuery(["  agerøvej  ", "x"]), "agerøvej");
  assert.equal(getMunicipalitySearchPath("aarhus", "agerøvej", 2), "/kommune/aarhus?q=ager%C3%B8vej&side=2");
});

test("readable detail paths use the address and a short id on collisions (B8)", () => {
  assert.equal(slugifyDanish("Åbyhøj Ærøvej 3"), "aabyhoej-aeroevej-3");
  const ryesgade18 = { id: "ed949021-d6b7-44c0-bb3b-79b3f958c9fd", addressLine1: "Ryesgade 18", postalCode: "8000", city: "Aarhus C", capacity: 286 };
  assert.equal(getCanonicalShelterSlug(ryesgade18), "ryesgade-18-8000-aarhus-c");

  const small = { ...ryesgade18, id: "281be9e0-f2aa-4c66-8a96-a3e2472c31b9", capacity: 40 };
  const slugs = getCanonicalShelterSlugs([small, ryesgade18]);
  assert.equal(slugs.get(ryesgade18.id), "ryesgade-18-8000-aarhus-c");
  assert.equal(slugs.get(small.id), "ryesgade-18-8000-aarhus-c-281be9");

  assert.deepEqual(readableSlugPostcodes("ryesgade-18-8000-aarhus-c"), ["8000"]);
  assert.equal(readableSlugShortId("ryesgade-18-8000-aarhus-c-281be9"), "281be9");
  assert.equal(readableSlugShortId("ryesgade-18-8000-aarhus-c"), null);

  const paths = getReadableGroupPaths(ryesgade18, [
    { slug: "registrering-ed949021d6b744c0bb3b79b3f958c9fd", capacity: 286 },
    { slug: "registrering-281be9e0f2aa4c668a96a3e2472c31b9", capacity: 40 },
  ]);
  assert.equal(paths.get("registrering-ed949021d6b744c0bb3b79b3f958c9fd"), "/beskyttelsesrum/ryesgade-18-8000-aarhus-c");
  assert.equal(paths.get("registrering-281be9e0f2aa4c668a96a3e2472c31b9"), "/beskyttelsesrum/ryesgade-18-8000-aarhus-c-281be9");
  assert.equal(
    getReadableShelterPathFromStable({ slug: "registrering-ed949021d6b744c0bb3b79b3f958c9fd", addressLine1: "Ryesgade 18", postalCode: "8000", city: "Aarhus C" }),
    "/beskyttelsesrum/ryesgade-18-8000-aarhus-c-ed9490",
  );
});

test("the offline copy record is validated before use (A4)", () => {
  assert.equal(parseOfflineCopyRecord(null), null);
  assert.equal(parseOfflineCopyRecord("{\"version\":1,\"savedAt\":\"nope\"}"), null);
  assert.deepEqual(
    parseOfflineCopyRecord(JSON.stringify({ version: 1, savedAt: "2026-10-01T10:00:00.000Z", search: { label: "Ryesgade 18", latitude: 56.15, longitude: 10.2 } })),
    { version: 1, savedAt: "2026-10-01T10:00:00.000Z", search: { label: "Ryesgade 18", latitude: 56.15, longitude: 10.2 } },
  );
  assert.deepEqual(
    parseOfflineCopyRecord(JSON.stringify({ version: 1, savedAt: "2026-10-01T10:00:00.000Z", search: { label: 3 } })),
    { version: 1, savedAt: "2026-10-01T10:00:00.000Z" },
  );
});

test("a removed registration's page answers with its last address and a nearby search", async () => {
  const { retiredShelterHtml } = await import("../src/lib/retired-shelter-page");
  const html = retiredShelterHtml({ addressLine1: "Nyvej <3>", postalCode: "8000", city: "Aarhus C", latitude: 56.15, longitude: 10.2 });
  assert.match(html, /Registreringen findes ikke længere i BBR/);
  assert.match(html, /Nyvej &#60;3&#62;, 8000 Aarhus C/);
  assert.match(html, /href="\/naer-dig\?lat=56\.15&#38;lng=10\.2&#38;q=Nyvej\+%3C3%3E%2C\+8000\+Aarhus\+C"/);
  assert.match(retiredShelterHtml(null), /href="\/"/);
});

test("the proxy recognises removed paths from a cached hash list and fails open", async () => {
  const { isRetiredShelterPath, sha256Hex } = await import("../src/lib/retired-shelter-paths");
  const env = { url: "https://example.supabase.co", publishableKey: "key" };
  const removed = await sha256Hex("nyvej-3-8000-aarhus-c");
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json([{ path_hash: removed }]);
  }) as typeof fetch;

  assert.equal(await isRetiredShelterPath("nyvej-3-8000-aarhus-c", env), true);
  assert.equal(await isRetiredShelterPath("ryesgade-18-8000-aarhus-c", env), false);
  assert.equal(calls, 1, "the list is fetched once and then served from memory");
});

test("the live postcode table is validated before use", async () => {
  const { isPostalAreaTable } = await import("../src/lib/address/locality");
  assert.equal(isPostalAreaTable({ postnumre: [["6857", "Blåvand", [], 55.56, 8.08]], kommuner: [] }), true);
  assert.equal(isPostalAreaTable({ postnumre: [["6857", "Blåvand"]], kommuner: [] }), false);
  assert.equal(isPostalAreaTable({ error: { code: "postal_areas_unavailable" } }), false);
});

test("a hanging address lookup fails with a visible error instead of spinning forever", async () => {
  const { resolveAddress, adressevaelgerTimeoutMs } = await import("../src/lib/address/adressevaelger");
  assert.equal(adressevaelgerTimeoutMs, 10_000);
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })) as typeof fetch;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => realSetTimeout(callback, 0)) as typeof setTimeout;
  try {
    await assert.rejects(
      resolveAddress({ kind: "address", id: "x", label: "Testvej 1" }),
      (error: unknown) => error instanceof Error && !(error instanceof DOMException) && /did not answer/.test(error.message),
    );
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test("the time limit also covers a response body that stalls", async () => {
  const { resolveAddress } = await import("../src/lib/address/adressevaelger");
  // Headers arrive at once; the body never finishes until the request is aborted.
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => Promise.resolve(new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    },
  }), { status: 200 }))) as typeof fetch;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => realSetTimeout(callback, 0)) as typeof setTimeout;
  try {
    await assert.rejects(
      resolveAddress({ kind: "address", id: "x", label: "Testvej 1" }),
      (error: unknown) => error instanceof Error && /did not answer/.test(error.message),
    );
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
