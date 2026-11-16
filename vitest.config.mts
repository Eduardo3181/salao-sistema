import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    include: ["tests/**/*.test.ts"],
    env: loadEnv(mode, process.cwd(), ""), // lê o .env.local
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
}));
