export type BoundedRequestTextResult =
  | { ok: true; text: string; byteLength: number }
  | { ok: false; reason: "too_large" | "unreadable" };

function declaredBodyLength(request: Request) {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d+$/.test(value.trim())) return null;

  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

/**
 * Reads a request body without ever buffering more than `maximumBytes`.
 * This keeps chunked requests inside the same limit as requests that declare
 * Content-Length.
 */
export async function readBoundedRequestText(
  request: Request,
  maximumBytes: number,
): Promise<BoundedRequestTextResult> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("maximumBytes must be a non-negative safe integer.");
  }

  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maximumBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "", byteLength: 0 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel("request body exceeds configured limit").catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    ok: true,
    text: new TextDecoder().decode(body),
    byteLength,
  };
}
