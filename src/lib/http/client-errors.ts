/** Parses a JSON response body, or returns {} when an upstream failure sent HTML or nothing. */
export async function readJsonSafely<T extends object>(response: Response): Promise<Partial<T>> {
  return (await response.json().catch(() => ({}))) as Partial<T>;
}

/**
 * Network failures surface as browser-specific TypeErrors ("Failed to fetch",
 * "Load failed"); show our own Danish text instead. Errors we throw ourselves
 * carry a message meant for the visitor.
 */
export function visibleErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : fallback;
}
