export type ImportLifecycleState = "active" | "missing_from_source" | "suppressed";

export type ImportedShelterStatus = "active" | "temporarily_closed" | "under_review";

export type ImportedShelterMunicipality = {
  code: string;
  slug: string;
  name: string;
  regionName: string | null;
};

export type ImportedShelterBaseline = {
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  sourceApplicationCode: string | null;
  status: ImportedShelterStatus;
  accessibilityNotes: string | null;
  summary: string;
};

export type ImportedShelterSource = {
  canonicalSourceName: string;
  canonicalSourceReference: string;
  sourceName: string;
  sourceType: "official";
  sourceUrl: string | null;
  sourceReference: string;
  lastVerifiedAt: string | null;
  notes: string | null;
};

export type ImportedShelterRecord = {
  municipality: ImportedShelterMunicipality;
  shelter: ImportedShelterBaseline;
  source: ImportedShelterSource;
  lifecycle: {
    importState: Extract<ImportLifecycleState, "active">;
  };
};

export type ImporterWarningLevel = "warning" | "error";

export type ImporterWarning = {
  level: ImporterWarningLevel;
  code: string;
  message: string;
  reference?: string;
};

export type ImporterFetchStats = {
  fetchedRecords: number;
  acceptedAfterCapacityFilter: number;
  normalizedRecords: number;
  skippedRecords: number;
  missingOrNonPositiveCapacityCount: number;
  missingAddressCount: number;
  missingMunicipalityCount: number;
  acceptedWithCoordinatesCount: number;
  acceptedWithoutCoordinatesCount: number;
  missingCoordinatesCount: number;
  coordinateParseFailureCount: number;
  darBatchSizeUsed: number;
  darFailedBatchCount: number;
  acceptedRecordsSkippedDueToDarFailure: number;
  skipReasonCounts: Array<{
    code: string;
    count: number;
  }>;
};

export type ImporterFetchResult = {
  records: ImportedShelterRecord[];
  warnings: ImporterWarning[];
  stats: ImporterFetchStats;
};

export type ImporterRunSummary = {
  sourceName: string;
  snapshotName: string;
  dryRun: boolean;
  resumedFromImportRunId: string | null;
  recordsSeen: number;
  inserted: number;
  updated: number;
  unchanged: number;
  restored: number;
  missing: number;
  recordsUpserted: number;
  importRunId: string | null;
  pagesFetched: number;
  lastSuccessfulPage: number;
  lastSuccessfulCursor: string | null;
  missingTransitionsApplied: boolean;
  missingTransitionsSkippedReason: string | null;
  warningsCount: number;
  warningExamples: string[];
  fetchStats: ImporterFetchStats;
};
