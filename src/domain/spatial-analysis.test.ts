import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { spatialRequestSchema, spatialResultSchema, spatialInputHash, spatialSI, type SpatialResult } from "./spatial-analysis";
import { runSpatialAnalysis } from "@/infrastructure/analysis/spatial-runner";
import { POST } from "@/app/api/analysis3d/route";
import { createQuickProject } from "./quick-project";
import { buildSpatialRequest, spatialContacts, spatialReadiness } from "./spatial-readiness";
import { generateStructure } from "./calculations/structure";
import type { StructureModel } from "./structure";
import path from "node:path";

const fixture = () => spatialRequestSchema.parse(JSON.parse(readFileSync("engine/examples/spatial-portal.json", "utf8")));
let result: SpatialResult;
beforeAll(async () => { result = await runSpatialAnalysis(fixture()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("executa Python real, confere hash canônico entre linguagens, IDs e referência independente", async () => {
  expect(result.status).toBe("analysis_completed_experimental");
  expect(result.input_sha256).toBe(await spatialInputHash(fixture()));
  expect(result.input_sha256).toBe("596c492437a138eba82f67f3ac3f38e2a313ce0b723544f88242e70a9ce162b7");
  expect(result.project.source).toBe(fixture().project.source);
  expect(result.combinations["TESTE-1"].nodes.D.translation_m[1]).toBeCloseTo(.0005502202603822671, 12);
  expect(result.combinations["TESTE-1"].equilibrium.relative_residual).toBeLessThan(1e-10);
  expect(spatialResultSchema.safeParse(result).success).toBe(true);
});
it("converte unidades exclusivamente na fronteira física", () => {
  expect(spatialSI.metres(3000)).toBe(3); expect(spatialSI.area(100)).toBe(.01);
  expect(spatialSI.inertia(8000)).toBe(.00008); expect(spatialSI.modulus(200)).toBe(200e9);
  expect(spatialSI.force(-10)).toBe(-10000); expect(spatialSI.moment(-5)).toBe(-5000);
});
it("hash cobre apoio, rotação, liberações, propriedades, revisão, carga e combinação", async () => {
  const original = await spatialInputHash(fixture());
  const mutations = [
    (p: ReturnType<typeof fixture>) => { p.supports[0].restrained[0] = false; },
    (p: ReturnType<typeof fixture>) => { p.members[0].rotation_deg = 90; },
    (p: ReturnType<typeof fixture>) => { p.members[0].release_end[3] = true; },
    (p: ReturnType<typeof fixture>) => { p.sections[0].j_m4 *= 2; },
    (p: ReturnType<typeof fixture>) => { p.project.revision = "R2"; },
    (p: ReturnType<typeof fixture>) => { p.nodal_loads[0].fx_n *= 2; },
    (p: ReturnType<typeof fixture>) => { p.combinations[0].factors.TESTE = -1; },
  ];
  for (const mutate of mutations) { const p = fixture(); mutate(p); expect(await spatialInputHash(p)).not.toBe(original); }
});
it("contrato recusa fontes/propriedades ausentes, dados não finitos, duplicatas, cargas órfãs e combinações vazias", () => {
  const mutations = [
    (p: ReturnType<typeof fixture>) => { p.materials[0].source = " "; },
    (p: ReturnType<typeof fixture>) => { p.materials[0].g_pa = NaN; },
    (p: ReturnType<typeof fixture>) => { p.sections[0].iy_m4 = 0; },
    (p: ReturnType<typeof fixture>) => { p.nodes.push(p.nodes[0]); },
    (p: ReturnType<typeof fixture>) => { p.nodal_loads[0].node = "UNKNOWN"; },
    (p: ReturnType<typeof fixture>) => { p.combinations = []; },
    (p: ReturnType<typeof fixture>) => { p.combinations[0].factors = { MISSING: 1 }; },
    (p: ReturnType<typeof fixture>) => { p.members[0].release_start[0] = true; },
  ];
  for (const mutate of mutations) { const p = fixture(); mutate(p); expect(spatialRequestSchema.safeParse(p).success).toBe(false); }
});
it("3D sólido rápido 10×20 não se torna apto para análise nem recebe apoios/cargas implícitos", async () => {
  const p = createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4 });
  const before = JSON.stringify(p), readiness = spatialReadiness(p);
  expect(readiness.visual_ready).toBe(true); expect(readiness.analysis_ready).toBe(false);
  for (const code of ["INTERIOR_CONTACT", "PHYSICAL_PROPERTIES", "CONNECTIONS", "SUPPORTS", "LOAD_PATH", "COMBINATIONS", "LATERAL_SYSTEM"]) expect(readiness.issues.some(i => i.code === code)).toBe(true);
  await expect(buildSpatialRequest(p, fixture(), { connections: "revisadas", lateralSystem: "pórticos declarados" })).rejects.toThrow(/Topologia/);
  expect(JSON.stringify(p)).toBe(before);
});
it("prevalidador identifica cruzamentos sem nó e sobreposição, preservando IDs", () => {
  const p = createQuickProject({ typology: "mono", widthM: 10, lengthM: 20, heightM: 4 }), m = generateStructure(p).model!;
  const modified: StructureModel = { ...m, nodes: [{ id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 2, y: 2, z: 0 }, { id: "C", x: 0, y: 2, z: 0 }, { id: "D", x: 2, y: 0, z: 0 }], pieces: [{ ...m.pieces[0], id: "ONE", start: "A", end: "B" }, { ...m.pieces[0], id: "TWO", start: "C", end: "D" }] };
  expect(spatialContacts(modified).find(i => i.code === "UNCONNECTED_CROSSING")?.pieces).toEqual(["ONE", "TWO"]);
  modified.nodes = [{ id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 3, y: 0, z: 0 }, { id: "C", x: 1, y: 0, z: 0 }, { id: "D", x: 4, y: 0, z: 0 }];
  expect(spatialContacts(modified).some(i => i.code === "OVERLAP")).toBe(true);
});
it("mapeia geometria compatível apenas com declarações completas e muda revisão quando o perfil visual muda", async () => {
  const p = createQuickProject({ typology: "mono", widthM: 10, lengthM: 20, heightM: 4 });
  p.planning!.purlinSpacingM = 100; // Fixture explicit with only edge purlins.
  const model = generateStructure(p).model!, declared = fixture();
  declared.nodes = model.nodes.map(n => ({ id: n.id, x_m: n.x / 1000, y_m: n.y / 1000, z_m: n.z / 1000 }));
  declared.members = model.pieces.map(piece => ({ ...declared.members[0], id: piece.id, start: piece.start, end: piece.end }));
  declared.supports = model.nodes.filter(n => n.z === 0).map(n => ({ node: n.id, restrained: [true, true, true, true, true, true] }));
  declared.nodal_loads[0].node = model.nodes.find(n => n.z > 0)!.id;
  const review = { connections: "Fixture: juntas rígidas declaradas", lateralSystem: "Fixture: ação de pórtico nas três direções" };
  const before = JSON.stringify(p);
  expect(spatialReadiness(p, declared).analysis_ready).toBe(false);
  expect(spatialReadiness(p, declared, review).analysis_ready).toBe(true);
  const request = await buildSpatialRequest(p, declared, review);
  expect(await buildSpatialRequest(p, request, review)).toEqual(request);
  expect(request.members.map(m => m.id)).toEqual(model.pieces.map(m => m.id));
  expect(request.nodes).toEqual(declared.nodes); expect(JSON.stringify(p)).toBe(before);
  p.planning!.profiles.column.visualSection!.rollDeg = 90;
  const next = await buildSpatialRequest(p, declared, review);
  expect(next.project.revision).not.toBe(request.project.revision);
  expect(await spatialInputHash(next)).not.toBe(await spatialInputHash(request));
});
it("API protege origem, corpo e contrato e executa a análise real", async () => {
  expect((await POST(new Request("http://localhost/api/analysis3d", { method: "POST", headers: { origin: "https://foreign.invalid" }, body: "{}" }))).status).toBe(403);
  expect((await POST(new Request("http://localhost/api/analysis3d", { method: "POST", body: "x".repeat(500001) }))).status).toBe(413);
  expect((await POST(new Request("http://localhost/api/analysis3d", { method: "POST", body: "{}" }))).status).toBe(422);
  const r = await POST(new Request("http://localhost/api/analysis3d", { method: "POST", body: JSON.stringify(fixture()) }));
  expect(r.status).toBe(200); expect((await r.json()).input_sha256).toBe(result.input_sha256);
});
it("Vercel sem serviço e Python inexistente falham sem resultado fictício", async () => {
  vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", ""); vi.stubEnv("VERCEL", "1");
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "UNAVAILABLE" });
  vi.stubEnv("VERCEL", ""); vi.stubEnv("JPN_PYTHON_EXECUTABLE", path.resolve("missing-python-3d"));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
const envelope = (payload: string, value: unknown = result) => Response.json({ request_sha256: createHash("sha256").update(payload).digest("hex"), result: value });
it("HTTP exige HTTPS, valida limites, IDs, hash e esquema da resposta", async () => {
  vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", "http://remote.invalid/analyze3d");
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "CONFIGURATION" });
  vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", "https://solver.invalid/analyze3d");
  const fetcher = vi.spyOn(globalThis, "fetch");
  fetcher.mockResolvedValueOnce(Response.json({ request_sha256: "wrong", result }));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  fetcher.mockResolvedValueOnce(new Response("x".repeat(2_000_001)));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  fetcher.mockImplementationOnce(async (_, options) => envelope(String(options!.body), { ...result, input_sha256: "0".repeat(64) }));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  const altered = structuredClone(result); delete altered.combinations["TESTE-1"].nodes.A;
  fetcher.mockImplementationOnce(async (_, options) => envelope(String(options!.body), altered));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("timeout e limite de concorrência liberam a capacidade sem publicar respostas parciais", async () => {
  vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", "https://solver.invalid/analyze3d");
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "TIMEOUT" });
  const pending: Array<() => void> = [];
  fetcher.mockImplementation((_, options) => new Promise(resolve => pending.push(() => resolve(envelope(String(options!.body))))));
  const first = runSpatialAnalysis(fixture()), second = runSpatialAnalysis(fixture());
  await expect(runSpatialAnalysis(fixture())).rejects.toMatchObject({ code: "BUSY" });
  pending.forEach(resolve => resolve()); await expect(first).resolves.toMatchObject({ status: "analysis_completed_experimental" }); await second;
});
it("serviço Python HTTP real analisa 3D com token privado, preservando contrato de transporte", async () => {
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const python = process.env.JPN_PYTHON_EXECUTABLE || path.resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const child = spawn(python, ["-m", "jpn_structural.service", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...process.env, JPN_ANALYSIS_TOKEN: "frame3d-test-token" } });
  try {
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch {} if (!ready) await new Promise(resolve => setTimeout(resolve, 100)); }
    expect(ready).toBe(true);
    vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", `http://127.0.0.1:${port}/analyze3d`); vi.stubEnv("JPN_ANALYSIS_TOKEN", "frame3d-test-token");
    expect((await runSpatialAnalysis(fixture())).input_sha256).toBe(result.input_sha256);
  } finally { child.kill(); }
}, 15000);
