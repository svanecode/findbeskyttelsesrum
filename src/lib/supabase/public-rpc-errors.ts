const missingPublicRpcCodes = new Set(["PGRST202", "42883"]);

export function isMissingPublicRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && missingPublicRpcCodes.has(code);
}
