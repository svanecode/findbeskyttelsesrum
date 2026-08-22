import assert from "node:assert/strict";
import test from "node:test";

import { getShelterPublicPath, getStableShelterSlug } from "../src/lib/shelter-public-url";

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
