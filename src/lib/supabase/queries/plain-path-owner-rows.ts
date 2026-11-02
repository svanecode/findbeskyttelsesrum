const columnName = "public_plain_path_owner_ids_v1";

/**
 * Ids from the rows of `public_plain_path_owner_ids_v1` (setof uuid). PostgREST
 * returns either bare strings or objects named after the function; anything
 * else is ignored.
 */
export function parsePlainPathOwnerRows(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const row of data) {
    const value = typeof row === "object" && row !== null ? (row as Record<string, unknown>)[columnName] : row;
    if (typeof value === "string" && value !== "") ids.push(value);
  }
  return ids;
}
