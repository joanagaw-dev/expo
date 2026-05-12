import codspeed from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [codspeed()],
  test: {
    benchmark: {
      include: ["**/*.bench.ts"],
    },
    // Increase timeouts for CodSpeed simulation mode (valgrind),
    // which makes execution ~10-100x slower than native
    testTimeout: 300_000,
    hookTimeout: 300_000,
    teardownTimeout: 300_000,
  },
});
