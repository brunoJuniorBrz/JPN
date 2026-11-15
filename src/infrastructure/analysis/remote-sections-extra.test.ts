import { afterEach, expect, it, vi } from "vitest";
import { POST as section } from "@/app/api/experimental/section/route";

/** Without the optional `sections` extra the engine answers 503 SECTIONS_EXTRA_MISSING; the app must pass that code through
 * with a clear message and never publish a result. (The engine side is tested in engine/tests/test_optional_extras.py.) */
const origin = "https://jpn.example.invalid", token = "int2-synthetic-server-token", password = "int2-synthetic-operator-password";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("rota remota de seção: extra ausente no engine vira erro claro (503, código preservado), sem resultado", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED", "1"); vi.stubEnv("JPN_MIXED_BACKEND_URL", "https://engine.example.invalid");
  vi.stubEnv("JPN_MIXED_DEPLOYMENT_BYPASS_SECRET", ""); vi.stubEnv("JPN_MIXED_APP_ORIGIN", origin);
  vi.stubEnv("JPN_ANALYSIS_TOKEN", token); vi.stubEnv("JPN_MIXED_ACCESS_USER", "operator"); vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD", password);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: { code: "SECTIONS_EXTRA_MISSING", message: "Optional engine extra ..." } }), { status: 503, headers: { "Content-Type": "application/json" } });
  });
  const payload = JSON.stringify({ schema_version: "jpn.section-analysis/1", units: "mm", geometry: { shape: "rectangle", height: 40, width: 20 },
    poisson: .3, source: "INT-2 rectangle", revision: "1", responsible: "test", convergence: .001 }, null, 2);
  const response = await section(new Request(origin + "/api/experimental/section", { method: "POST", body: payload,
    headers: { origin, host: new URL(origin).host, "Content-Type": "application/json", Authorization: `Basic ${Buffer.from("operator:" + password).toString("base64")}` } }));
  const body = await response.json();
  expect(calls).toEqual(["https://engine.example.invalid/api/analyze-section"]);
  expect(response.status).toBe(503);
  expect(body.error.code).toBe("SECTIONS_EXTRA_MISSING");
  expect(body.error.message).toContain("sections"); expect(body.error.message).toContain("jpn-structural[sections]");
  expect(body.result).toBeUndefined();
});
