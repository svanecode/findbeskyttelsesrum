/**
 * PostgREST returns at most `max_rows` rows per request (1000, see
 * supabase/config.toml and the hosted project), whatever `.limit()` asks for.
 * A list that can grow past that must be read page by page.
 */
export const postgrestMaxRows = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every row by calling `page(from, to)` until a page comes back short. */
export async function readAllPages<T>(
  page: (from: number, to: number) => Page<T>,
  label: string,
  pageSize = postgrestMaxRows,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}
