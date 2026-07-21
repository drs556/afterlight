import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/modules/scoring/**", "src/modules/calibration/**"],
      // Correctness-critical pure modules: ≥90% branch coverage (docs/02 §8.3).
      thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
