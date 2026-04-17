import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true)
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "react-native": path.resolve(root, "src/test/shims/react-native.ts")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    setupFiles: ["./vitest.setup.ts"]
  }
});
