import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.live.test.ts"],
    setupFiles: ["test/setup.ts"],
    reporters: ["default"],
    globals: false,
    testTimeout: 60_000
  }
});
