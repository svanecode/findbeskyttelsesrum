import assert from "node:assert/strict";
import test from "node:test";
import { isMissingPublicRpcError } from "../src/lib/supabase/public-rpc-errors";

test("public RPC fallback is limited to rolling-deploy missing-function errors", () => {
  assert.equal(isMissingPublicRpcError({ code: "PGRST202" }), true);
  assert.equal(isMissingPublicRpcError({ code: "42883" }), true);

  for (const error of [
    { code: "42501" },
    { code: "PGRST301" },
    { code: "XX000" },
    { message: "database unavailable" },
    null,
  ]) {
    assert.equal(isMissingPublicRpcError(error), false);
  }
});
