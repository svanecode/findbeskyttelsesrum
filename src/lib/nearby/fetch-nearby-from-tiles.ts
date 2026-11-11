import {
  isNearbyTilePayload,
  parseTileKey,
  rankNearbyGroupsFromTilesAllowingGaps,
  revisionCounter,
  surroundingTileKeys,
  type NearbyTilePayload,
  type RankedNearbyGroup,
} from "./tiles";

// Set by public/offline-sw.js on tiles it serves from its cache.
const offlineCachedAtHeader = "X-Offline-Cached-At";

type FetchLike = (input: string) => Promise<Response>;

export type TileSearchResult = {
  groups: RankedNearbyGroup[];
  // When any tile came from the offline cache: the oldest cache time.
  savedAt: string | null;
  // True when the loaded tiles cannot guarantee the list is complete. Only
  // returned with `allowIncomplete`.
  incomplete: boolean;
};

type FetchedTile = { payload: NearbyTilePayload; cachedAt: string | null };

async function fetchTile(fetchImpl: FetchLike, key: string, path: string): Promise<FetchedTile> {
  const response = await fetchImpl(path);
  if (!response.ok) throw new Error(`nearby tile ${key} failed with status ${response.status}`);
  const cachedAt = response.headers.get(offlineCachedAtHeader);
  const payload: unknown = await response.json();
  if (!isNearbyTilePayload(payload, key)) throw new Error(`nearby tile ${key} returned an invalid payload`);
  return { payload, cachedAt };
}

function hasOneRevision(tiles: NearbyTilePayload[]) {
  return new Set(tiles.map((tile) => tile.revision)).size === 1;
}

/**
 * Loads the CDN-cached tiles around the position and ranks them on the
 * device. Returns null whenever the result cannot be guaranteed identical to
 * the server search (outside the tile grid, revisions that stay mixed after a
 * refresh, or too few results inside the loaded block); a failed tile rejects.
 * With `allowIncomplete` (the page sets it only while offline) the last case
 * returns the ranked tile results marked `incomplete` instead of null.
 *
 * One exception: when at least one tile was served by public/offline-sw.js
 * from a cache (it carries X-Offline-Cached-At), the tiles may span two data
 * revisions. That covers the visitor's saved copy (saved across a
 * publication) and also the worker's ordinary-cache fallback while online
 * (after a timeout or a 5xx). When the newer revision cannot be fetched, or
 * stays mixed, the tiles are ranked as they are, since the page then shows
 * them as saved data that may be out of date.
 */
export async function fetchNearbyFromTiles(
  lat: number,
  lng: number,
  options: { limit: number; radiusMeters: number; fetch: FetchLike; allowIncomplete?: boolean },
): Promise<TileSearchResult | null> {
  const keys = surroundingTileKeys(lat, lng);
  if (keys.some((key) => parseTileKey(key) === null)) return null;

  let fetched = await Promise.all(keys.map((key) => fetchTile(options.fetch, key, `/api/app-v2/nearby/tiles/${key}`)));
  let tiles = fetched.map((tile) => tile.payload);

  // Right after a publication some tiles are still cached from the previous
  // revision. Fetch only those again, pinned to the newest revision seen.
  if (!hasOneRevision(tiles)) {
    const fromSavedCopy = fetched.some((tile) => tile.cachedAt);
    const counters = tiles.map((tile) => revisionCounter(tile.revision));
    if (counters.some((counter) => counter === null)) return null;
    const newest = tiles[counters.indexOf(Math.max(...(counters as number[])))]!.revision;
    const newestCounter = revisionCounter(newest)!;
    const original = fetched;
    let refreshed: FetchedTile[] | null = null;
    try {
      refreshed = await Promise.all(original.map((tile, index) => tile.payload.revision === newest
        ? tile
        : fetchTile(options.fetch, keys[index]!, `/api/app-v2/nearby/tiles/${keys[index]}/${newestCounter}`)));
    } catch (error) {
      if (!fromSavedCopy) throw error;
    }
    if (refreshed && hasOneRevision(refreshed.map((tile) => tile.payload))) {
      // Only what is still used counts: tiles replaced by fresh ones no longer date the result.
      fetched = refreshed;
    } else if (!fromSavedCopy) {
      return null;
    }
    tiles = fetched.map((tile) => tile.payload);
  }

  const { groups, complete } = rankNearbyGroupsFromTilesAllowingGaps(tiles, { latitude: lat, longitude: lng }, {
    limit: options.limit,
    radiusMeters: options.radiusMeters,
  });
  if (!complete && !options.allowIncomplete) return null;
  const cachedAt = fetched.flatMap((tile) => (tile.cachedAt ? [tile.cachedAt] : [])).sort();
  return { groups, savedAt: cachedAt[0] ?? null, incomplete: !complete };
}
