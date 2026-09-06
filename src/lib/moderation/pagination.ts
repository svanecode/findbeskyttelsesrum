export const moderationPageSize = 50;

export function parseModerationPage(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 2_147_483_647 ? page : 1;
}

export function moderationQueueReturnPath(
  formData: FormData,
  basePath: "/admin" | "/admin/kontakt",
  statuses: readonly string[],
  result: { error: string } | { updated: "1" },
) {
  const query = new URLSearchParams({
    page: String(parseModerationPage(formData.get("returnPage"))),
    ...result,
  });
  const status = formData.get("returnStatus");
  if (typeof status === "string" && statuses.includes(status)) query.set("status", status);
  // The destination is supplied by the action, never by a posted URL.
  return `${basePath}?${query}`;
}

export type ModerationQueuePage<TRow, TStatus extends string> = {
  rows: TRow[];
  counts: Record<TStatus, number>;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function parseModerationQueuePage<TRow, TStatus extends string>(
  value: unknown,
  statuses: readonly TStatus[],
): ModerationQueuePage<TRow, TStatus> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid moderation queue response.");
  }
  const data = value as Record<string, unknown>;
  const number = (key: string, minimum: number) => {
    const result = Number(data[key]);
    if (!Number.isSafeInteger(result) || result < minimum) throw new Error("Invalid moderation pagination.");
    return result;
  };
  if (!Array.isArray(data.rows) || !data.counts || typeof data.counts !== "object" || Array.isArray(data.counts)) {
    throw new Error("Invalid moderation queue rows or counts.");
  }
  const rawCounts = data.counts as Record<string, unknown>;
  const counts = Object.fromEntries(statuses.map((status) => {
    const count = Number(rawCounts[status] ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid moderation queue count.");
    return [status, count];
  })) as Record<TStatus, number>;
  return {
    rows: data.rows as TRow[],
    counts,
    totalCount: number("totalCount", 0),
    page: number("page", 1),
    pageSize: number("pageSize", 1),
    totalPages: number("totalPages", 1),
  };
}
