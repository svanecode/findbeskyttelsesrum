/**
 * Paths of registrations removed from BBR, as SHA-256 hashes, for src/proxy.ts.
 *
 * The list is small and changes at most once a day, so each server instance
 * keeps it in memory for ten minutes and refreshes it in the background. A
 * page view therefore costs one hash and a set lookup, never a database call.
 * Any failure leaves the list empty, so detail pages always keep working.
 */

const refreshAfterMs = 10 * 60 * 1000;
const retryAfterFailureMs = 60 * 1000;
const firstLoadTimeoutMs = 800;

type Cache = { hashes: Set<string>; expiresAt: number };

let cache: Cache | null = null;
let refreshing: Promise<Cache> | null = null;

// PostgREST returns at most 1000 rows per request, so the list is read in pages.
const pageSize = 1000;

async function loadHashes(url: string, publishableKey: string): Promise<Cache> {
  try {
    const hashes = new Set<string>();
    for (let offset = 0; ; offset += pageSize) {
      const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/retired_shelter_path_hashes_v1`
        + `?order=path_hash.asc&limit=${pageSize}&offset=${offset}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
          "Content-Profile": "app_v2",
          "Accept-Profile": "app_v2",
        },
        body: "{}",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const rows = (await response.json()) as Array<{ path_hash?: unknown }>;
      for (const row of rows) if (typeof row.path_hash === "string") hashes.add(row.path_hash);
      if (rows.length < pageSize) break;
    }
    return { hashes, expiresAt: Date.now() + refreshAfterMs };
  } catch {
    return { hashes: cache?.hashes ?? new Set(), expiresAt: Date.now() + retryAfterFailureMs };
  }
}

function refresh(url: string, publishableKey: string) {
  refreshing ??= loadHashes(url, publishableKey).then((next) => {
    cache = next;
    refreshing = null;
    return next;
  });
  return refreshing;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True when the slug belongs to a registration removed from BBR. */
export async function isRetiredShelterPath(slug: string, env: { url: string; publishableKey: string }) {
  let current = cache;
  if (!current) {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), firstLoadTimeoutMs));
    current = await Promise.race([refresh(env.url, env.publishableKey), timeout]);
    if (!current) return false;
  } else if (current.expiresAt < Date.now()) {
    void refresh(env.url, env.publishableKey);
  }
  if (current.hashes.size === 0) return false;
  return current.hashes.has(await sha256Hex(slug));
}
