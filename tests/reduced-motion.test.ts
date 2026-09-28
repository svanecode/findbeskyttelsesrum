import assert from "node:assert/strict";
import test from "node:test";

import { prefersReducedMotion, scrollBehavior } from "../src/lib/ui/reduced-motion";

test("animations follow the visitor's reduced-motion setting", () => {
  assert.equal(prefersReducedMotion(), false, "no window during server rendering");
  assert.equal(scrollBehavior(), "smooth");

  const scope = globalThis as { window?: unknown };
  try {
    for (const reduce of [true, false]) {
      scope.window = { matchMedia: (query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" }) };
      assert.equal(prefersReducedMotion(), reduce);
      assert.equal(scrollBehavior(), reduce ? "auto" : "smooth");
    }
  } finally {
    delete scope.window;
  }
});
