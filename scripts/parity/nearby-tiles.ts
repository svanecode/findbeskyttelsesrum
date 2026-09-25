/**
 * Parity check for on-device nearby ranking (ARCH-01).
 *
 * For sample positions across Denmark it compares the tile-based ranking with
 * the server search (POST /api/app-v2/nearby/grouped) on a live deployment.
 * Uses public endpoints only; no secrets.
 *
 *   PARITY_BASE_URL=https://findbeskyttelsesrum.dk npx tsx scripts/parity/nearby-tiles.ts
 *   PARITY_COOKIE="_vercel_jwt=…"   # only for protected preview deployments
 */
import {
  isNearbyTilePayload,
  parseTileKey,
  rankNearbyGroupsFromTiles,
  surroundingTileKeys,
  type NearbyTilePayload,
} from "../../src/lib/nearby/tiles";

const baseUrl = (process.env.PARITY_BASE_URL ?? "https://findbeskyttelsesrum.dk").replace(/\/$/, "");
const cookie = process.env.PARITY_COOKIE;
const limit = 10;
const radiusMeters = 50_000;

// Cities, towns and rural points, including islands and the tile-grid edges.
const samplePositions: Array<[string, number, number]> = [
  ["Rådhuspladsen", 55.6761, 12.5683],
  ["Nørrebro", 55.6941, 12.5494],
  ["Amager", 55.6496, 12.6010],
  ["Aarhus C", 56.1567, 10.2108],
  ["Odense", 55.3959, 10.3883],
  ["Aalborg", 57.0488, 9.9217],
  ["Esbjerg", 55.4765, 8.4594],
  ["Roskilde", 55.6415, 12.0803],
  ["Kolding", 55.4904, 9.4722],
  ["Rønne", 55.1009, 14.7066],
  ["Skagen", 57.7209, 10.5839],
  ["Tønder", 54.9336, 8.8633],
  ["Samsø", 55.8667, 10.6167],
  ["Lolland", 54.7700, 11.5000],
  ["Mors", 56.8167, 8.7500],
  ["Tile edge 55.75 N", 55.7500, 12.5000],
  ["Tile edge 12.4 E", 55.6000, 12.4000],
];

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
}

type ServerGroup = { address: { line1: string }; shelterCount: number; totalCapacity: number; shelterSlugs: string[] };

async function serverSearch(latitude: number, longitude: number): Promise<ServerGroup[]> {
  const response = await request("/api/app-v2/nearby/grouped", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: latitude, lng: longitude, limit }),
  });
  if (!response.ok) throw new Error(`server search failed with HTTP ${response.status}`);
  return ((await response.json()) as { results: ServerGroup[] }).results;
}

async function tileSearch(latitude: number, longitude: number) {
  const keys = surroundingTileKeys(latitude, longitude);
  if (keys.some((key) => parseTileKey(key) === null)) return null;
  const tiles: NearbyTilePayload[] = await Promise.all(keys.map(async (key) => {
    const response = await request(`/api/app-v2/nearby/tiles/${key}`);
    if (!response.ok) throw new Error(`tile ${key} failed with HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isNearbyTilePayload(payload, key)) throw new Error(`tile ${key} returned an invalid payload`);
    return payload;
  }));
  if (new Set(tiles.map((tile) => tile.revision)).size !== 1) return null;
  return rankNearbyGroupsFromTiles(tiles, { latitude, longitude }, { limit, radiusMeters });
}

function signature(groups: ServerGroup[]) {
  return groups.map((group) => `${group.shelterSlugs.join("+")}|${group.shelterCount}|${group.totalCapacity}`);
}

async function main() {
  console.log(`Nearby tile parity against ${baseUrl}`);
  let mismatches = 0;
  let fallbacks = 0;

  for (const [name, latitude, longitude] of samplePositions) {
    const [server, tiles] = await Promise.all([serverSearch(latitude, longitude), tileSearch(latitude, longitude)]);
    if (tiles === null) {
      fallbacks += 1;
      console.log(`FALLBACK  ${name}: tiles cannot guarantee an exact answer; the page uses the server search`);
      continue;
    }

    const expected = signature(server);
    const actual = signature(tiles);
    const firstDifference = expected.findIndex((value, index) => value !== actual[index]);
    if (expected.length !== actual.length || firstDifference !== -1) {
      mismatches += 1;
      const index = firstDifference === -1 ? Math.min(expected.length, actual.length) : firstDifference;
      console.log(`MISMATCH  ${name} at #${index + 1}\n  server: ${expected[index] ?? "(none)"}\n  tiles:  ${actual[index] ?? "(none)"}`);
    } else {
      console.log(`PASS      ${name}: ${actual.length} groups identical`);
    }
  }

  console.log(`\n${samplePositions.length - mismatches - fallbacks} identical, ${fallbacks} fallbacks, ${mismatches} mismatches.`);
  if (mismatches > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
