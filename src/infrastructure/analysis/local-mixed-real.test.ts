import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { adaptMixedProject } from "@/domain/mixed-adapter";
import { mixedReferenceProject } from "@/domain/examples/mixed-project";
import { mixedInputHash, verifyMixedResult } from "@/domain/mixed-analysis";
import { runLocalMixed } from "./local-mixed-runner";
import { GET, POST } from "@/app/api/experimental/mixed3d/route";

function enabled() { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1"); vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000"); }
afterEach(() => vi.unstubAllEnvs());
it("executa adaptador → processo Python 3.12/PyNite 3.2.1 real → resultado estrito, equilíbrio e cargas invertidas", async () => {
  enabled(); const prepared = await adaptMixedProject(mixedReferenceProject());
  expect(prepared.request).toEqual(JSON.parse(readFileSync("engine/examples/mixed-adapted-roof.json", "utf8")));
  const out = await runLocalMixed(JSON.stringify(prepared.request));
  if (out.status !== "completed") throw new Error("Expected analysis");
  expect(out.result.input_sha256).toBe(await mixedInputHash(prepared.request));
  expect(out.execution.memory_limit_bytes).toBe(805306368);
  const a = out.result.combinations["TESTE-1"], b = out.result.combinations["INVERSO-1"];
  expect(Object.keys(a.members)).toHaveLength(243); expect(a.equilibrium.relative_residual).toBeLessThan(1e-8);
  for (const [id, node] of Object.entries(a.nodes)) {
    for (const key of ["translation_m", "rotation_rad", "reaction_force_n", "reaction_moment_nm"] as const) node[key].forEach((x, i) => expect(b.nodes[id][key][i]).toBeCloseTo(-x, 8));
  }
  for (const [id, member] of Object.entries(a.members)) {
    const other = b.members[id];
    if (member.kind === "axial" && other.kind === "axial") expect(other.axial_n).toBeCloseTo(-member.axial_n, 8);
    if (member.kind === "frame" && other.kind === "frame") member.end_actions_local.forEach((x, i) => expect(other.end_actions_local[i]).toBeCloseTo(-x, 8));
  }
  const altered = structuredClone(out.result); altered.input_sha256 = "0".repeat(64);
  expect(() => verifyMixedResult(prepared.request, altered, prepared.input_sha256)).toThrow(/hash/);
  delete altered.combinations["TESTE-1"].members[prepared.request.members[0].id]; altered.input_sha256 = prepared.input_sha256;
  expect(() => verifyMixedResult(prepared.request, altered, prepared.input_sha256)).toThrow(/IDs/);
}, 20000);
it("API não expõe execução em produção, dev comum, origem remota ou Host adulterado", async () => {
  const request = (origin = "http://127.0.0.1:3000", host = "127.0.0.1:3000") => new Request("http://localhost:3000/api/experimental/mixed3d", { method: "POST", headers: { origin, host, "content-type": "application/json" }, body: "{}" });
  enabled(); vi.stubEnv("NODE_ENV", "production"); expect((await POST(request())).status).toBe(403);
  enabled(); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "0"); expect((await POST(request())).status).toBe(403);
  enabled(); expect((await POST(request("https://remote.invalid"))).status).toBe(403);
  expect((await POST(request(undefined, "remote.invalid"))).status).toBe(403);
  expect((await POST(new Request("http://127.0.0.1:3000/api/experimental/mixed3d", { method: "POST", headers: { host: "127.0.0.1:3000" }, body: "{}" }))).status).toBe(403);
  expect((await POST(request())).status).toBe(422);
});
it("health da API importa dependências reais e rejeita corpos excessivos antes do processo", async () => {
  enabled();
  const health = await GET(new Request("http://localhost:3000/api/experimental/mixed3d", { headers: { host: "127.0.0.1:3000" } }));
  expect(health.status).toBe(200); expect((await health.json()).dependencies.PyNiteFEA).toBe("3.2.1");
  expect((await POST(new Request("http://localhost:3000/api/experimental/mixed3d", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: " ".repeat(500001) }))).status).toBe(413);
}, 15000);
