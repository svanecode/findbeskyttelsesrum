import type { ImportedShelterRecord } from "@/lib/importer/types";

const fixtureSourceName = "fixture-official-register";
const fixtureSourceUrl = "https://example.com/official-fixture-register";

const baselineRecords: ImportedShelterRecord[] = [
  {
    municipality: {
      code: "0101",
      slug: "kobenhavn",
      name: "Copenhagen",
      regionName: "Capital Region of Denmark",
    },
    shelter: {
      slug: "amager-boulevard-kaelder",
      name: "Amager Boulevard Basement Shelter",
      addressLine1: "Amager Boulevard 115",
      postalCode: "2300",
      city: "Copenhagen S",
      latitude: 55.6645,
      longitude: 12.6027,
      capacity: 220,
      status: "active",
      accessibilityNotes: "Step-free entrance from the courtyard.",
      summary: "Official fixture record for a large basement shelter near Amager Boulevard.",
    },
    source: {
      canonicalSourceName: fixtureSourceName,
      canonicalSourceReference: "fixture-001",
      sourceName: "Fixture Official Register",
      sourceType: "official",
      sourceUrl: `${fixtureSourceUrl}/fixture-001`,
      sourceReference: "fixture-001",
      lastVerifiedAt: "2026-03-10T08:00:00Z",
      notes: "Fixture baseline record.",
    },
    lifecycle: {
      importState: "active",
    },
  },
  {
    municipality: {
      code: "0101",
      slug: "kobenhavn",
      name: "Copenhagen",
      regionName: "Capital Region of Denmark",
    },
    shelter: {
      slug: "valby-parken-servicekaelder",
      name: "Valby Park Service Basement Shelter",
      addressLine1: "Hammelstrupvej 100",
      postalCode: "2450",
      city: "Copenhagen SV",
      latitude: 55.6384,
      longitude: 12.5085,
      capacity: 180,
      status: "under_review",
      accessibilityNotes: null,
      summary: "Official fixture record used to test later updates through canonical identity.",
    },
    source: {
      canonicalSourceName: fixtureSourceName,
      canonicalSourceReference: "fixture-002",
      sourceName: "Fixture Official Register",
      sourceType: "official",
      sourceUrl: `${fixtureSourceUrl}/fixture-002`,
      sourceReference: "fixture-002",
      lastVerifiedAt: "2026-03-09T08:00:00Z",
      notes: "Fixture baseline record.",
    },
    lifecycle: {
      importState: "active",
    },
  },
  {
    municipality: {
      code: "0147",
      slug: "frederiksberg",
      name: "Frederiksberg",
      regionName: "Capital Region of Denmark",
    },
    shelter: {
      slug: "frederiksberg-runddel-anlaeg",
      name: "Frederiksberg Runddel Utility Shelter",
      addressLine1: "Smallegade 38",
      postalCode: "2000",
      city: "Frederiksberg",
      latitude: 55.6772,
      longitude: 12.5318,
      capacity: 140,
      status: "active",
      accessibilityNotes: "Lift access confirmed by the official source.",
      summary: "Official fixture record for lifecycle testing in a later import snapshot.",
    },
    source: {
      canonicalSourceName: fixtureSourceName,
      canonicalSourceReference: "fixture-003",
      sourceName: "Fixture Official Register",
      sourceType: "official",
      sourceUrl: `${fixtureSourceUrl}/fixture-003`,
      sourceReference: "fixture-003",
      lastVerifiedAt: "2026-03-08T08:00:00Z",
      notes: "Fixture baseline record.",
    },
    lifecycle: {
      importState: "active",
    },
  },
];

const followUpRecords: ImportedShelterRecord[] = [
  baselineRecords[0],
  {
    municipality: {
      code: "0101",
      slug: "kobenhavn",
      name: "Copenhagen",
      regionName: "Capital Region of Denmark",
    },
    shelter: {
      slug: "valby-parken-servicekaelder",
      name: "Valby Park Service Basement Shelter",
      addressLine1: "Hammelstrupvej 100",
      postalCode: "2450",
      city: "Copenhagen SV",
      latitude: 55.6384,
      longitude: 12.5085,
      capacity: 210,
      status: "active",
      accessibilityNotes: "Official follow-up confirms ground-level access.",
      summary: "Updated official fixture record used to verify canonical upsert behavior.",
    },
    source: {
      canonicalSourceName: fixtureSourceName,
      canonicalSourceReference: "fixture-002",
      sourceName: "Fixture Official Register",
      sourceType: "official",
      sourceUrl: `${fixtureSourceUrl}/fixture-002`,
      sourceReference: "fixture-002",
      lastVerifiedAt: "2026-03-15T08:00:00Z",
      notes: "Fixture follow-up update.",
    },
    lifecycle: {
      importState: "active",
    },
  },
  {
    municipality: {
      code: "0147",
      slug: "frederiksberg",
      name: "Frederiksberg",
      regionName: "Capital Region of Denmark",
    },
    shelter: {
      slug: "frederiksberg-station-driftskaelder",
      name: "Frederiksberg Station Operations Shelter",
      addressLine1: "Falkoner Alle 20",
      postalCode: "2000",
      city: "Frederiksberg",
      latitude: 55.6818,
      longitude: 12.5347,
      capacity: 160,
      status: "active",
      accessibilityNotes: null,
      summary: "New official fixture record introduced in the follow-up snapshot.",
    },
    source: {
      canonicalSourceName: fixtureSourceName,
      canonicalSourceReference: "fixture-004",
      sourceName: "Fixture Official Register",
      sourceType: "official",
      sourceUrl: `${fixtureSourceUrl}/fixture-004`,
      sourceReference: "fixture-004",
      lastVerifiedAt: "2026-03-15T08:30:00Z",
      notes: "Fixture follow-up insert.",
    },
    lifecycle: {
      importState: "active",
    },
  },
];

export const fixtureSnapshots: Record<string, ImportedShelterRecord[]> = {
  baseline: baselineRecords,
  "follow-up": followUpRecords,
};

export const fixtureSnapshotNames = Object.keys(fixtureSnapshots);
