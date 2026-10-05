import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { postgrestMaxRows, readAllPages } from "../src/lib/supabase/read-all-pages";

/** Behaves like PostgREST: any request returns at most max_rows rows. */
function fakePostgrest<T>(rows: T[]) {
  const requests: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    requests.push([from, to]);
    const end = Math.min(to + 1, from + postgrestMaxRows);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { page, requests };
}

test("all postcodes are read past PostgREST's 1000-row limit", async () => {
  const postcodes = Array.from({ length: 1089 }, (_, index) => String(1050 + index * 8));
  postcodes.push("3700", "9000", "9940", "9990");
  const { page, requests } = fakePostgrest(postcodes);

  const rows = await readAllPages(page, "postcodes");

  assert.equal(rows.length, postcodes.length);
  for (const postnr of ["3700", "9000", "9940", "9990"]) assert.ok(rows.includes(postnr), `${postnr} is missing`);
  assert.deepEqual(requests, [[0, 999], [1000, 1999]]);
});

test("a failed page fails the whole read instead of returning part of the table", async () => {
  let calls = 0;
  const page = () => Promise.resolve(
    calls++ === 0
      ? { data: Array.from({ length: postgrestMaxRows }, (_, index) => index), error: null }
      : { data: null, error: { message: "timeout" } },
  );
  await assert.rejects(readAllPages(page, "postcodes"), /Could not load postcodes: timeout/);
});

test("the bundled postcode table has every postcode and all 98 municipalities", async () => {
  const table = JSON.parse(await readFile(new URL("../src/lib/address/postal-areas.json", import.meta.url), "utf8")) as {
    postnumre: Array<[string, string, string[], number, number]>;
    kommuner: Array<[string, string]>;
  };
  const postcodes = new Set(table.postnumre.map(([postnr]) => postnr));
  assert.ok(table.postnumre.length >= 1050, `only ${table.postnumre.length} postcodes`);
  for (const postnr of ["3700", "9000", "9990"]) assert.ok(postcodes.has(postnr), `${postnr} is missing`);
  assert.equal(table.kommuner.length, 98);
  assert.ok(table.kommuner.some(([code, name]) => code === "0825" && name === "Læsø"));
});

test("the live postcode table is paged and lists municipalities without registrations", async () => {
  const [query, retired, shelters] = await Promise.all([
    readFile(new URL("../src/lib/supabase/queries/postal-areas.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/retired-shelter-paths.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/supabase/queries/shelters.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(query, /\.limit\(/, "a .limit() above 1000 is silently capped by PostgREST");
  assert.match(query, /readAllPages<PostalAreaDbRow>/);
  // municipality_public_v2 leaves out municipalities without public registrations (Læsø).
  assert.match(query, /from\("municipality_summary_public_v1"\)/);
  assert.doesNotMatch(query, /municipality_public_v2/);
  assert.match(retired, /limit=\$\{pageSize\}&offset=\$\{offset\}/);
  assert.doesNotMatch(shelters, /\.limit\(2000\)/);
});
