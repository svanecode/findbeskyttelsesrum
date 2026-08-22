import "server-only";

import type { NextRequest } from "next/server";

export function isSameOriginContactRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function readContactJsonBody<T>(request: NextRequest, maximumBytes: number): Promise<T | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
