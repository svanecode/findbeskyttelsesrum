import { fixtureSnapshotNames, fixtureSnapshots } from "@/lib/importer/fixtures/shelter-fixtures";
import type { OfficialSourceAdapter } from "@/lib/importer/source-adapter";
import type { ImporterFetchResult } from "@/lib/importer/types";

export class FixtureOfficialSourceAdapter implements OfficialSourceAdapter {
  readonly sourceName = "fixture-official-register";
  readonly sourceUrl = "https://example.com/official-fixture-register";

  async fetchRecords(snapshot: { name: string }): Promise<ImporterFetchResult> {
    const records = fixtureSnapshots[snapshot.name];

    if (!records) {
      throw new Error(
        `Unknown fixture snapshot "${snapshot.name}". Available snapshots: ${fixtureSnapshotNames.join(", ")}.`,
      );
    }

    return {
      records,
      warnings: [],
      stats: {
        fetchedRecords: records.length,
        acceptedAfterCapacityFilter: records.length,
        normalizedRecords: records.length,
        skippedRecords: 0,
        missingOrNonPositiveCapacityCount: 0,
        missingAddressCount: 0,
        missingMunicipalityCount: 0,
        acceptedWithCoordinatesCount: records.filter(
          (record) => record.shelter.latitude !== null && record.shelter.longitude !== null,
        ).length,
        acceptedWithoutCoordinatesCount: records.filter(
          (record) => record.shelter.latitude === null || record.shelter.longitude === null,
        ).length,
        missingCoordinatesCount: 0,
        coordinateParseFailureCount: 0,
        darBatchSizeUsed: 0,
        darFailedBatchCount: 0,
        acceptedRecordsSkippedDueToDarFailure: 0,
        skipReasonCounts: [],
      },
    };
  }
}
