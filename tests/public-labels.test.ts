import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicApplicationLabel } from "../src/lib/public-labels";
import { dedupeAddressSuggestions, type DawaSuggestion } from "../src/lib/dawa/autocomplete";

test("internal lifecycle prefixes are removed from public application labels", () => {
  assert.equal(
    normalizePublicApplicationLabel("(UDFASES) Bygning til hotel, restaurant eller lignende"),
    "Bygning til hotel, restaurant eller lignende",
  );
  assert.equal(normalizePublicApplicationLabel("Sikringsrum"), "Sikringsrum");
});

test("address suggestions with identical building coordinates are deduplicated", () => {
  const suggestions: DawaSuggestion[] = [
    { tekst: "Rådhuspladsen 1, 1550 København V", data: { x: 12.568, y: 55.676 } },
    { tekst: "Rådhuspladsen 1, st., 1550 København V", data: { x: 12.568, y: 55.676 } },
    { tekst: "Rådhuspladsen 2, 1550 København V", data: { x: 12.569, y: 55.676 } },
  ];

  assert.deepEqual(dedupeAddressSuggestions(suggestions, 5).map((item) => item.tekst), [
    "Rådhuspladsen 1, 1550 København V",
    "Rådhuspladsen 2, 1550 København V",
  ]);
});
