import assert from "node:assert/strict";
import { test } from "node:test";

import { groupOverlappingPoints } from "../src/lib/maps/group-overlapping";

test("pins at the same or almost the same place share one pin (4.1)", () => {
  const groups = groupOverlappingPoints([
    { id: "1", x: 100, y: 100 },
    { id: "2", x: 100, y: 100 },
    { id: "3", x: 300, y: 100 },
    { id: "4", x: 112, y: 106 },
    { id: "5", x: 300, y: 160 },
  ], 30);
  assert.deepEqual(groups, [["1", "2", "4"], ["3"], ["5"]]);
});

test("pins far enough apart keep their own pin", () => {
  assert.deepEqual(groupOverlappingPoints([{ id: "a", x: 0, y: 0 }, { id: "b", x: 30, y: 0 }], 30), [["a"], ["b"]]);
});
