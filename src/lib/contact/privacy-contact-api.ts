import "server-only";

import type { NextRequest } from "next/server";

import { readBoundedRequestText } from "@/lib/http/read-bounded-request-text";

// Messages allow 4,000 UTF-16 characters. In UTF-8 JSON one character can take
// up to six bytes (a \u escape), so the cap must exceed 24,000 bytes plus the
// subject and field names; a smaller cap rejected valid Danish or emoji text.
export const maximumContactBodyBytes = 32_768;

export async function readContactJsonBody<T>(request: NextRequest, maximumBytes: number): Promise<T | null> {
  const result = await readBoundedRequestText(request, maximumBytes);
  if (!result.ok) return null;

  try {
    return JSON.parse(result.text) as T;
  } catch {
    return null;
  }
}
