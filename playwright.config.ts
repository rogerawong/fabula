import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke config (docs/07 Layer 5): few, fat, stable flows against
 * the production build via `vite preview`. Chromium-only — the smoke
 * suite guards behavior, not browser matrices.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    // Never reuse: a leftover dev/preview server serving a stale build
    // makes failures lie about the current code. Fresh build every run.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
