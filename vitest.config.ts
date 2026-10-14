import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [["server/**", "node"]],
    setupFiles: ["./tests/setup.ts"],
    // Bound GitHub Actions workers to avoid oversubscribing the shared runner host.
    maxWorkers: process.env.QUESTARR_CI_VITEST_MAX_WORKERS === "4" ? 4 : undefined,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: {
        statements: 83,
        branches: 76,
        functions: 79,
        lines: 84,
      },
      exclude: [
        "**/vendor/node-forge/**",
        "**/vendor/http-cache-semantics/**",
        "scripts/check-production-licenses.mjs",
        "scripts/release-notes.mjs",
      ],
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "tests/e2e/**",
      "tests/stack/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
