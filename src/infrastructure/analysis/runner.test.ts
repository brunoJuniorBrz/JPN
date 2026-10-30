import { afterEach, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { runAnalysis } from "./runner";
import { trussRequestSchema, buildTrussRequest } from "@/domain/analysis";
import { planningExample } from "@/domain/planning-example";
import { sectionDataSchema } from "@/domain/structure";
import { structureSignature } from "@/domain/calculations/project-basis";
import { POST } from "@/app/api/analysis/route";

const triangle = () => trussRequestSchema.parse(JSON.parse(readFileSync("engine/examples/triangle.json", "utf8")));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("chama o processo Python real e confere a referência analítica", async () => {
  const r = await runAnalysis(triangle());
  expect(r.nodes["0"].ry_n).toBeCloseTo(5000, 9);
  expect(r.nodes["2"].uy_m).toBeCloseTo(-10000 * (Math.sqrt(2) + .5) / 200e6, 12);
  expect(r.members.M0.axial_n).toBeCloseTo(5000, 9);
  expect(r.input_sha256).toMatch(/^[a-f0-9]{64}$/);
});
it("propaga mecanismo instável sem gerar resultado falso", async () => {
  await expect(runAnalysis({ ...triangle(), supports: [] })).rejects.toMatchObject({ code: "UNSTABLE" });
});
it("Vercel sem serviço bloqueia só a análise", async () => {
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("JPN_ANALYSIS_URL", "");
  await expect(runAnalysis(triangle())).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
it("verifica identidade das entradas na resposta remota", async () => {
  vi.stubEnv("JPN_ANALYSIS_URL", "https://solver.example.invalid/analyze");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ request_sha256: "wrong", result: {} }), { status: 200 }));
  await expect(runAnalysis(triangle())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("adaptador HTTP chama serviço Python real separado", async () => {
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const portable = path.resolve(".tools/python/python.exe");
  const executable = process.env.JPN_PYTHON_EXECUTABLE || (existsSync(portable) ? portable : path.resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"));
  const child = spawn(executable, ["-m", "jpn_structural.service", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, JPN_ANALYSIS_TOKEN: "integration-test" } });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    expect(ready).toBe(true);
    vi.stubEnv("JPN_ANALYSIS_URL", `http://127.0.0.1:${port}/analyze`); vi.stubEnv("JPN_ANALYSIS_TOKEN", "integration-test");
    const result = await runAnalysis(triangle()); expect(result.nodes["0"].ry_n).toBeCloseTo(5000, 8);
  } finally { child.kill(); }
}, 15000);
it("API real protege origem e valida corpo antes de chamar Python", async () => {
  expect((await POST(new Request("http://localhost/api/analysis", { method: "POST", headers: { origin: "https://another.invalid" }, body: "{}" }))).status).toBe(403);
  expect((await POST(new Request("http://localhost/api/analysis", { method: "POST", body: "{}" }))).status).toBe(422);
  const response = await POST(new Request("http://localhost/api/analysis", { method: "POST", body: JSON.stringify(triangle()) }));
  expect(response.status).toBe(200); expect((await response.json()).nodes["1"].ry_n).toBeCloseTo(5000);
  const normalized = await POST(new Request("http://localhost:3000/api/analysis", { method: "POST", headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, body: JSON.stringify(triangle()) }));
  expect(normalized.status).toBe(200);
});
it("adaptador seleciona só T1 e converte mm, cm², GPa e kN", () => {
  const p = planningExample();
  for (const profile of Object.values(p.planning!.profiles)) { profile.source = "Referência sintética"; profile.data = { ...sectionDataSchema.parse({}), areaCm2: 10, elasticModulusGpa: 200, sourceDate: "2026-10-30" }; }
  p.workspace.analysis = { signature: structureSignature(p), supports: [], loads: [], articulated: true };
  const initial = buildTrussRequest(p), id = initial.nodes[0].id;
  p.workspace.analysis.supports = [{ node: id, uxMm: 1, uyMm: 0 }]; p.workspace.analysis.loads = [{ node: id, fxKn: -2, fyKn: 3 }];
  const r = buildTrussRequest(p);
  expect(r.members.every(m => m.id.startsWith("T1-"))).toBe(true); expect(r.members[0].area_m2).toBe(.001); expect(r.members[0].e_pa).toBe(200e9);
  expect(r.nodes[0].y_m).toBe(3.2); expect(r.supports[0].ux_m).toBe(.001); expect(r.loads[0].fx_n).toBe(-2000);
  p.roof.widthM = 12; expect(() => buildTrussRequest(p)).toThrow(/alterados/);
});
