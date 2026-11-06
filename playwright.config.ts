import { defineConfig, devices } from "@playwright/test";
const demoOrigin=`http://127.0.0.1:${process.env.JPN_LOCAL_PORT??"3000"}`;
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  use: { baseURL: demoOrigin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node scripts/dev-structural.mjs", url: `${demoOrigin}/demonstracao`, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
