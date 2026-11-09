import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://127.0.0.1:5100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\.spec\.ts/,
    },
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /(?:setup|auth)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      // Logout revokes every saved session for this user. Run it only after
      // journeys that reuse the setup project's authenticated storage state.
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      dependencies: ["e2e"],
      use: {
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});
