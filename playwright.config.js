import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  testDir: "./test/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/server.mjs",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
    url: "http://127.0.0.1:4173/healthz",
  },
  workers: 1,
});
