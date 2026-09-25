import "server-only";

import type { NextRequest } from "next/server";

import { readBoundedRequestText } from "@/lib/http/read-bounded-request-text";

export async function readContactJsonBody<T>(request: NextRequest, maximumBytes: number): Promise<T | null> {
  const result = await readBoundedRequestText(request, maximumBytes);
  if (!result.ok) return null;

  try {
    return JSON.parse(result.text) as T;
  } catch {
    return null;
  }
}
