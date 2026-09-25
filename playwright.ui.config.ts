import { defineConfig, devices } from "@playwright/test";

/**
 * Secret-free browser checks for contributors and AI agents.
 *
 * Starts `next dev` with placeholder Supabase values and runs every spec that
 * mocks its data. Tests tagged @full-stack need live data or a production
 * build (metrics, CSP, prerendered pages) and run only in CI via
 * playwright.config.ts.
 *
 *   npm run test:e2e:ui
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e:ui
 */
const baseURL = "http://127.0.0.1:3101";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "./e2e",
  grepInvert: /@full-stack/,
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["line"]],
  use: {
    baseURL,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3101",
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
      NEXT_TELEMETRY_DISABLED: "1",
      PLAYWRIGHT_HTTP_ORIGIN: "1",
    },
  },
});
