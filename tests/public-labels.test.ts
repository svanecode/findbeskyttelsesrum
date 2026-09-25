import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicApplicationLabel } from "../src/lib/public-labels";

test("internal lifecycle prefixes are removed from public application labels", () => {
  assert.equal(
    normalizePublicApplicationLabel("(UDFASES) Bygning til hotel, restaurant eller lignende"),
    "Bygning til hotel, restaurant eller lignende",
  );
  assert.equal(normalizePublicApplicationLabel("Sikringsrum"), "Sikringsrum");
});
