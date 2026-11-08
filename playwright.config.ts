import { defineConfig, devices } from "@playwright/test";

// Browser tests (issue #12). Run: npm run e2e   (first time: npx playwright install chromium)
// The app runs with DELT_E2E=1 so /e2e shows the inbox with fake mail; no Google sign-in needed.
const PORT = 3100;
// #171: throwaway probes live in e2e-scratch/ (gitignored) and run only when asked:
//   PW_SCRATCH=1 npx playwright test --project=phone
// A normal run reads e2e/ only, and skips old-style e2e/zz-* probes, so it is just the real suite.
const SCRATCH = /(^|[\\/])zz-[^\\/]*$/;
const scratch = !!process.env.PW_SCRATCH;
export default defineConfig({
  testDir: scratch ? "e2e-scratch" : "e2e",
  testIgnore: scratch ? [] : SCRATCH,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  // service workers off: the tests answer /api themselves (the worker never touches /api anyway)
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", serviceWorkers: "block", contextOptions: { reducedMotion: "reduce" } },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    // Safari's engine on an iPhone-sized screen (issue #17). Not a real iPhone, but catches most Safari issues.
    // a11y and layout measure CSS geometry, which phone and desktop already cover; WebKit's canvas
    // text metrics (used to find where letters start) differ, so they would test WebKit, not DELT
    { name: "iphone", use: { ...devices["iPhone 15"] }, testIgnore: scratch ? [] : [SCRATCH, /a11y|layout/] },
  ],
  webServer: {
    // CI builds first (see .github/workflows/test.yml); locally the dev server is fine.
    command: process.env.CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/e2e`,
    env: { DELT_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
