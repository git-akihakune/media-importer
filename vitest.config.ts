import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: new URL("./src/__tests__/__stubs__/obsidian.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    passWithNoTests: true,
  },
});