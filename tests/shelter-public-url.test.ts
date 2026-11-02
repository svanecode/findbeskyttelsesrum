import assert from "node:assert/strict";
import test from "node:test";

import { getShelterPublicPath, getStableShelterSlug, getSuffixedShelterSlug, isPlausiblePublicSlug } from "../src/lib/shelter-public-url";

test("stable shelter slugs depend only on the shelter UUID", () => {
  assert.equal(
    getStableShelterSlug("7C10B51D-D5F0-42FD-9F36-640958F85E29"),
    "registrering-7c10b51dd5f042fd9f36640958f85e29",
  );
});

test("public shelter paths encode untrusted slug input", () => {
  assert.equal(
    getShelterPublicPath("registrering-abc/def"),
    "/beskyttelsesrum/registrering-abc%2Fdef",
  );
});

test("invalid stable identifiers fail closed", () => {
  assert.throws(() => getStableShelterSlug("not-a-uuid"), /valid UUID/);
});

test("plausible public slugs are lower case letters, digits and hyphens", () => {
  for (const slug of [
    "registrering-1a2b",
    "vestergade-12-aarhus",
    "ærøskøbing-1",
    getStableShelterSlug("7C10B51D-D5F0-42FD-9F36-640958F85E29"),
    getSuffixedShelterSlug({ id: "281be9aa-0000-4000-8000-000000000000", addressLine1: "Ryesgade 22A", postalCode: "8000", city: "Aarhus C" }),
    "kommune-0101",
    "x".repeat(240),
  ]) {
    assert.equal(isPlausiblePublicSlug(slug), true, slug);
  }
});

test("implausible public slugs are rejected before any lookup", () => {
  for (const slug of ["", "x".repeat(241), "../x", "A B", "%00", "Ryesgade-18", "a/b", "a_b"]) {
    assert.equal(isPlausiblePublicSlug(slug), false, slug);
  }
});

test("plain-path owner keeps the plain slug in server lists, the others are suffixed", async () => {
  const { getOwnerAwareShelterSlugs, getSharedAddressPostcodes } = await import("../src/lib/shelter-public-url");
  const base = { addressLine1: "Ryesgade 22A", postalCode: "8000", city: "Aarhus C" };
  const a = { ...base, id: "281be9aa-0000-4000-8000-000000000000", capacity: 100 };
  const b = { ...base, id: "7c10b51d-0000-4000-8000-000000000000", capacity: 50 };
  const alone = { addressLine1: "Vestergade 1", postalCode: "9000", city: "Aalborg", id: "11111111-0000-4000-8000-000000000000", capacity: 10 };
  assert.deepEqual(getSharedAddressPostcodes([a, b, alone]), ["8000"]);
  assert.equal(getOwnerAwareShelterSlugs([a, b, alone], new Set([b.id])).get(b.id), "ryesgade-22a-8000-aarhus-c");
  assert.equal(getOwnerAwareShelterSlugs([a, b, alone], new Set([b.id])).get(a.id), "ryesgade-22a-8000-aarhus-c-281be9");
  assert.equal(getOwnerAwareShelterSlugs([a, b, alone], new Set()).get(a.id), "ryesgade-22a-8000-aarhus-c");
  assert.equal(getOwnerAwareShelterSlugs([a, b, alone], new Set()).get(alone.id), "vestergade-1-9000-aalborg");
});

test("only readable-to-readable redirects are temporary", async () => {
  const { getShelterRedirectKind } = await import("../src/lib/shelter-public-url");
  assert.equal(getShelterRedirectKind(true), "temporary");
  assert.equal(getShelterRedirectKind(false), "permanent");
});
