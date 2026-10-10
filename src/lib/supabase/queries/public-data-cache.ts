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

// How long a server may keep using a revision before checking again. Moderation
// expires it at once through revalidatePublicData().
const revisionCheckSeconds = 300;
// Entries are keyed by revision and never go stale on their own; this only
// bounds how long an unused revision's entries live.
const entrySeconds = 86_400;

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

/**
 * Wraps a public read so its result is shared until the public data revision
 * changes. Arguments become part of the key and must be JSON-serialisable, and
 * so must the result. Errors are not cached. A wrapped read must not call
 * another wrapped read: Next.js skips the data cache for nested entries.
 */
export function cachedPerRevision<Args extends unknown[], Result>(
  name: string,
  read: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    if (!hasNextDataCache()) return read(...args);
    const revision = await getCachedRevisionKey();
    return unstable_cache(read, ["app-v2-public", name, revision], { revalidate: entrySeconds })(...args);
  };
}
