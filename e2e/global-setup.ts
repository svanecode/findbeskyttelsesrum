import { readFile } from "node:fs/promises";
import path from "node:path";

type RoutesManifest = {
  headers?: Array<{
    headers?: Array<{ key?: string; value?: string }>;
  }>;
};

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_BASE_URL) return;

  const manifestPath = path.join(process.cwd(), ".next", "routes-manifest.json");
  let manifest: RoutesManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RoutesManifest;
  } catch {
    throw new Error(
      "Playwright requires a production build. Run `PLAYWRIGHT_HTTP_ORIGIN=1 npm run build` first or use an npm test:e2e script.",
    );
  }

  const contentSecurityPolicy = manifest.headers
    ?.flatMap((entry) => entry.headers ?? [])
    .find((header) => header.key?.toLowerCase() === "content-security-policy")
    ?.value;

  if (contentSecurityPolicy?.includes("upgrade-insecure-requests")) {
    throw new Error(
      "The existing .next build upgrades local HTTP assets to HTTPS. Rebuild with `PLAYWRIGHT_HTTP_ORIGIN=1 npm run build` before running Playwright.",
    );
  }
}
