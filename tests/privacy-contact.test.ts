import assert from "node:assert/strict";
import test from "node:test";

import {
  formatContactAccessKey,
  isContactAccessKey,
  isContactReference,
  isPrivacyContactCategory,
  normalizeContactAccessKey,
  normalizeContactReference,
} from "../src/lib/contact/privacy-contact";

test("mail-free contact credentials normalize without losing entropy", () => {
  const compactKey = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

  assert.equal(normalizeContactReference(" fbr-2026-abcd2345 "), "FBR-2026-ABCD2345");
  assert.equal(normalizeContactAccessKey(formatContactAccessKey(compactKey)), compactKey);
  assert.equal(formatContactAccessKey(compactKey), "2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ");
  assert.equal(isContactReference("FBR-2026-ABCD2345"), true);
  assert.equal(isContactReference("FBR-26-ABCD2345"), false);
  assert.equal(isContactAccessKey(compactKey), true);
  assert.equal(isContactAccessKey(`${compactKey.slice(0, 31)}O`), false);
});

test("contact categories are a closed allowlist", () => {
  assert.equal(isPrivacyContactCategory("privacy_rights"), true);
  assert.equal(isPrivacyContactCategory("service_question"), true);
  assert.equal(isPrivacyContactCategory("marketing"), false);
});
