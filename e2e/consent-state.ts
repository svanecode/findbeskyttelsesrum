/**
 * Browser state with the consent dialog already answered ("Tillad alle"), so
 * specs exercise the site as a returning visitor. The consent spec clears it
 * to test the first visit.
 */
export function consentGivenStorageState(baseURL: string) {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          {
            name: "findbeskyttelsesrum.consent.v1",
            value: JSON.stringify({ version: 1, statistics: true, decidedAt: "2026-09-28T00:00:00.000Z" }),
          },
        ],
      },
    ],
  };
}
