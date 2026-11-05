import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
// Explicit licensed-data validation; deliberately outside the public CI suite.
// No skip/fallback: missing private data fails the invocation.
export default defineConfig({resolve:{alias:{"@":fileURLToPath(new URL("../../src",import.meta.url))}},
  test:{include:["validation/m33a/private-validation.test.ts"],maxWorkers:1}});
