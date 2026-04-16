import type { ImporterFetchResult } from "@/lib/importer/types";

export type ImporterSnapshot = {
  name: string;
  maxPages?: number;
  resumeCursor?: string | null;
  resumePage?: number;
  onPageFetched?: (progress: {
    cursor: string | null;
    pagesFetched: number;
    fetchedRecords: number;
  }) => Promise<void> | void;
};

export interface OfficialSourceAdapter {
  readonly sourceName: string;
  readonly sourceUrl: string | null;
  fetchRecords(snapshot: ImporterSnapshot): Promise<ImporterFetchResult>;
}
