import { defineConfig } from "@playwright/test";
const port = Number(process.env.ONCOFLOW_TEST_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
