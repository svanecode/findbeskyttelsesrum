import { unstable_cache } from "next/cache";

import { getAppV2PublicDataRevision } from "./publication";

/**
 * Shared cache for public reads, keyed by the public data revision.
 *
 * Crawlers revisit the ~23,700 detail pages around the clock, and every ISR
 * regeneration used to read the same postcodes, municipalities and aliases
 * again (10 October 2026: ~148,000 database calls a day). Public data only
 * changes when an import or a moderation change bumps the revision, so each
 * read is stored once per revision in the Next.js data cache, which every
 * server instance and deployment shares. A new revision gives new cache keys,
 * so pages never keep data from before an import for longer than the revision
 * check below plus the page's own ISR lifetime.
 */

export const publicDataRevisionTag = "public-data-revision";

// How long a server may keep using a revision before checking again. Next.js
// gives a static page the lowest revalidate of the cached reads it uses, so
// this must not be shorter than the pages' own ISR lifetime (3600 seconds), or
// every detail page would be rebuilt every few minutes. An import is therefore
// seen after about two hours at most (this check plus the page's lifetime);
// moderation expires the revision at once through revalidatePublicData().
const revisionCheckSeconds = 3600;
// Entries are keyed by revision and never go stale on their own; this only
// bounds how long an unused revision's entries live.
const entrySeconds = 86_400;

export type RevisionCacheDependencies = {
  cache: typeof unstable_cache;
  readRevisionKey: () => Promise<string>;
  enabled: () => boolean;
};

/** Builds the revision cache from its dependencies, so tests can drive it with a fake data cache. */
export function createRevisionCache({ cache, readRevisionKey, enabled }: RevisionCacheDependencies) {
  /**
   * Wraps a public read so its result is shared until the public data revision
   * changes. Arguments become part of the key and must be JSON-serialisable, and
   * so must the result. Errors are not cached. A wrapped read must not call
   * another wrapped read: Next.js skips the data cache for nested entries.
   */
  function cachedPerRevision<Args extends unknown[], Result>(
    name: string,
    read: (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result> {
    return async (...args: Args) => {
      if (!enabled()) return read(...args);
      const revision = await readRevisionKey();
      return cache(read, ["app-v2-public", name, revision], { revalidate: entrySeconds })(...args);
    };
  }

  /**
   * Caches one read under a revision the caller has already read itself, for
   * routes that check the live revision. The entry is only reused while that
   * revision is current, so it never outlives an import or moderation change.
   */
  function readForRevision<Result>(name: string, revision: string, key: string, read: () => Promise<Result>) {
    if (!enabled()) return read();
    return cache(read, ["app-v2-public", name, revision, key], { revalidate: entrySeconds })();
  }

  return { cachedPerRevision, readForRevision };
}

const getCachedRevisionKey = unstable_cache(
  async () => (await getAppV2PublicDataRevision()).cacheKey,
  ["app-v2-public-data-revision"],
  { revalidate: revisionCheckSeconds, tags: [publicDataRevisionTag] },
);

// The data cache only exists inside the Next.js server. Scripts and unit tests
// import the same queries and read the database directly.
function hasNextDataCache() {
  return Boolean(process.env.NEXT_RUNTIME);
}

export const { cachedPerRevision, readForRevision } = createRevisionCache({
  cache: unstable_cache,
  readRevisionKey: getCachedRevisionKey,
  enabled: hasNextDataCache,
});
