import { defineConfig } from "vitest/config";
import path from "path";

// Vitest 4 removed `environmentMatchGlobs`; the replacement is `projects`,
// which lets us route component tests to jsdom and everything else to node.
// Global options (globalSetup, setupFiles, alias) must be shared across
// projects, so we set them here at the top level AND each project inherits
// via `extends: true`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    globalSetup: ["./src/test/setup-globals.ts"],
    setupFiles: ["./src/test/vitest-setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/components/**"],
          // DB-using tests share a single `keystone_test` database and use
          // `truncateAll()` in beforeEach — parallel test files would clobber
          // each other's fixtures. Run node test files serially.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/components/**/*.test.ts", "src/components/**/*.test.tsx"],
        },
      },
    ],
  },
});
