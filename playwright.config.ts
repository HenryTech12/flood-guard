import { defineConfig, devices } from "@playwright/test";

// E2E runs against a real server + database with MESSAGING_PROVIDER=mock.
//   E2E_BASE_URL=http://localhost:3000 npx playwright test   (reuse a running dev server)
//   npx playwright test                                      (builds and starts on :3100)
const external = process.env.E2E_BASE_URL;
const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 900 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: external
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        url: `http://localhost:${port}/api/public/zones`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: { DEMO_MODE: "true", MESSAGING_PROVIDER: "mock", EMAIL_PROVIDER: "mock", OPS_NOTIFY_EMAILS: process.env.OPS_NOTIFY_EMAILS ?? "sema-ops@example.com", DEMO_KEY: process.env.DEMO_KEY ?? "floodguard-demo", PUBLIC_BASE_URL: `http://localhost:${port}` },
      },
});
