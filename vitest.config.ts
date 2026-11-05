import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
// Integration files start real capped Python workers. Run files serially so
// unrelated numerical tests do not consume their fixed HTTP time budget.
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }, test: { include: ["src/**/*.test.ts"], maxWorkers: 1 } });
