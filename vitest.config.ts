import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the React Router plugin isn't needed for unit tests
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["app/**/*.test.ts"],
  },
});
