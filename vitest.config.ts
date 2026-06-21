import { defineConfig } from "vitest/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (tsconfig maps "@/*" -> "./*") so tests can
// import app modules the same way the app does.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
