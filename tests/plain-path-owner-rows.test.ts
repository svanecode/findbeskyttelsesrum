import assert from "node:assert/strict";
import test from "node:test";

import { parsePlainPathOwnerRows } from "../src/lib/supabase/queries/plain-path-owner-rows";

test("owner ids are read from a flat array or from named columns", () => {
  assert.deepEqual(parsePlainPathOwnerRows(["a", "b"]), ["a", "b"]);
  assert.deepEqual(parsePlainPathOwnerRows([{ public_plain_path_owner_ids_v1: "a" }, { public_plain_path_owner_ids_v1: "b" }]), ["a", "b"]);
});

test("anything else in the owner rows is ignored", () => {
  assert.deepEqual(parsePlainPathOwnerRows(null), []);
  assert.deepEqual(parsePlainPathOwnerRows("a"), []);
  assert.deepEqual(parsePlainPathOwnerRows(["a", 1, null, {}, { public_plain_path_owner_ids_v1: 2 }, { other: "x" }, ""]), ["a"]);
});
