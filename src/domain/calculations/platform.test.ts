import { describe, expect, it } from "vitest";
import { planningExample } from "../planning-example";
import { emptySnapshot, migrateSnapshot } from "../models";
import { generateStructure } from "./structure";
import { packBars, projectCutting } from "./cutting";
import { captureRevision, structureSignature, transferTakeoff } from "./project-basis";
import { calculateEstimate } from "./estimate";
import { LocalRepositories, parseBackup, serializeBackup } from "@/infrastructure/persistence/local";
import { preprojectExample } from "../preproject-example";
import { buildTrussRequest } from "../analysis";
import { mkdirSync, writeFileSync } from "node:fs";

describe("tipologias e balanços", () => {
  it("divide banzos na cumeeira e preserva área desenvolvida e simetria", () => {
    const p = planningExample(); p.planning!.typology = "gable";
    const m = generateStructure(p).model!;
    expect(m.roofAreaM2).toBeCloseTo(20 * 2 * Math.hypot(5, .5), 10);
    expect(Math.max(...m.nodes.map(n => n.z))).toBe(4500);
    expect(m.nodes.some(n => n.x === 5000 && n.z === 4500)).toBe(true);
    const lengths = m.pieces.filter(p => p.role === "topChord").map(p => p.lengthMm);
    expect(new Set(lengths.map(l => l.toFixed(6))).size).toBe(1);
    expect(m.purlinRows % 2).toBe(1);
    p.planning!.panels = 3; expect(generateStructure(p).model).toBeNull();
  });
  it("balanços criam somente trechos reais de terça e atualizam área", () => {
    const p = planningExample(), initial = generateStructure(p).model!;
    p.planning!.overhangStartM = .5; p.planning!.overhangEndM = 1;
    const m = generateStructure(p).model!;
    expect(m.frameCount).toBe(initial.frameCount);
    expect(m.pieces.length).toBe(initial.pieces.length + 2 * initial.purlinRows);
    expect(m.nodes.some(n => n.y === -500)).toBe(true);
    expect(m.nodes.some(n => n.y === 21000)).toBe(true);
    expect(m.roofAreaM2).toBeCloseTo(initial.roofAreaM2 * 21.5 / 20, 10);
    p.planning!.overhangStartM = null; expect(generateStructure(p).model).toBeNull();
  });
  it("duas águas preserva quantidades ao refletir a queda e permutar os eixos", () => {
    const p = planningExample(); p.planning!.typology = "gable";
    const a = generateStructure(p).model!;
    p.roof.fall = "width-negative"; expect(generateStructure(p).model!.totalLengthM).toBeCloseTo(a.totalLengthM, 9);
    p.roof = { ...p.roof, widthM: 20, lengthM: 10, fall: "length-positive" };
    const b = generateStructure(p).model!; expect(b.totalLengthM).toBeCloseTo(a.totalLengthM, 9);
    expect(b.nodes.map(n => [n.y, n.x, n.z])).toEqual(a.nodes.map(n => [n.x, n.y, n.z]));
  });
});

// Independent exhaustive partition search for SMALL fixtures, not production FFD.
function exactBins(items: number[], capacity: number): number {
  let best = items.length;
  function visit(i: number, loads: number[]) {
    if (loads.length >= best) return;
    if (i === items.length) { best = loads.length; return; }
    for (let k = 0; k < loads.length; k++) if (loads[k] + items[i] <= capacity) { loads[k] += items[i]; visit(i + 1, loads); loads[k] -= items[i]; }
    loads.push(items[i]); visit(i + 1, loads); loads.pop();
  }
  visit(0, []); return best;
}
const pack = (lengths: number[], extra = {}) => packBars({ stockMm: 10, kerfMm: 0, endTrimMm: 0, minimumRemnantMm: 0, pieces: lengths.map((lengthMm, i) => ({ id: `P${i}`, lengthMm })), ...extra });
describe("aproveitamento de barras", () => {
  it.each([[6, 4, 6, 4], [8, 2, 7, 3], [3, 3, 3], [5, 5, 5, 5]])("compara instâncias pequenas com particionamento exato: %j", (...items) => {
    const lengths = items as number[]; expect(pack(lengths).bars.length).toBe(exactBins(lengths, 10));
  });
  it("não promete ótimo quando a heurística perde para uma solução conhecida", () => {
    // FFD: 4+4; 3+3+3; 3 => 3 versus (4+3+3) twice => 2.
    const items = [4, 4, 3, 3, 3, 3];
    expect(exactBins(items, 10)).toBe(2);
    expect(pack(items).bars.length).toBe(3);
    expect(pack(items).optimality).toBe("heuristic");
  });
  it("contabiliza serra, duas pontas e sobra reutilizável sem exceder estoque", () => {
    const r = pack([3, 3], { kerfMm: .5, endTrimMm: 1, minimumRemnantMm: 2 });
    expect(r.bars[0].remainderMm).toBe(1); expect(r.bars[0].reusableMm).toBe(0); expect(r.bars[0].wasteMm).toBe(4);
    expect(() => pack([8], { kerfMm: 1, endTrimMm: 1 })).toThrow(/maior/);
    expect(() => pack([1], { kerfMm: NaN })).toThrow();
    expect(() => pack([1, 2], { pieces: [{ id: "A", lengthMm: 1 }, { id: "A", lengthMm: 2 }] })).toThrow(/duplicadas/);
  });
  it("conserva quantidades e comprimentos em 300 problemas com semente fixa", () => {
    let seed = 719;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 300; i++) {
      const pieces = Array.from({ length: 3 + Math.floor(random() * 30) }, (_, j) => ({ id: `P${j}`, lengthMm: 100 + Math.floor(random() * 1000) }));
      const r = packBars({ stockMm: 6000, kerfMm: 3, endTrimMm: 10, minimumRemnantMm: 500, pieces });
      expect(r.bars.flatMap(b => b.pieces.map(p => p.id)).sort()).toEqual(pieces.map(p => p.id).sort());
      for (const b of r.bars) expect(b.pieces.reduce((s, p) => s + p.lengthMm, 0) + b.kerfMm + b.trimMm + b.remainderMm).toBeCloseTo(b.stockMm, 9);
      expect(r.totalPieceMm).toBe(pieces.reduce((s, p) => s + p.lengthMm, 0));
    }
  });
  it("separa perfis e recusa comprimentos finais ausentes/desatualizados", () => {
    const p = planningExample(); p.workspace.cutting = { kerfMm: 0, endTrimMm: 0, minimumRemnantMm: 0, useFabrication: false };
    const plan = projectCutting(p); expect(plan.groups).toHaveLength(5);
    expect(plan.groups.flatMap(g => g.bars.flatMap(b => b.pieces))).toHaveLength(123);
    p.workspace.cutting.useFabrication = true; expect(() => projectCutting(p)).toThrow(/ausente/);
  });
  it("processa levantamento maior dentro do limite, conservando as 3.815 peças", () => {
    const p = planningExample(); p.roof.lengthM = 90; p.planning!.frameSpacingM = 1; p.planning!.panels = 8;
    p.workspace.cutting = { kerfMm: 3, endTrimMm: 10, minimumRemnantMm: 500, useFabrication: false };
    const start = performance.now(), model = generateStructure(p).model!, geometryMs = performance.now() - start;
    const cutStart = performance.now(), plan = projectCutting(p), cuttingMs = performance.now() - cutStart;
    expect(model.pieces).toHaveLength(3815); expect(plan.groups.flatMap(g => g.bars.flatMap(b => b.pieces))).toHaveLength(3815);
    mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/performance.json", JSON.stringify({ environment: "Node local, not a physical mobile benchmark", pieces: model.pieces.length, geometryMs, cuttingMs }));
  });
});
describe("origem, migração e revisões", () => {
  it("exemplo importável executa o fluxo de quantitativo, corte e orçamento sem custos presumidos", () => {
    const p = preprojectExample();
    expect(p.isExample).toBe(true); expect(buildTrussRequest(p).members.length).toBeGreaterThan(0);
    expect(calculateEstimate(p).pending).toEqual([]); expect(projectCutting(p).groups.length).toBe(5);
    const backup = serializeBackup({ ...emptySnapshot(), exampleInstalled: true, projects: [p] });
    const reopened = parseBackup(backup).data.projects[0];
    expect(reopened).toEqual(p); expect(structureSignature(reopened)).toBe(structureSignature(p));
    expect(buildTrussRequest(reopened).members.length).toBeGreaterThan(0);
    mkdirSync("test-results/examples", { recursive: true }); writeFileSync("test-results/examples/preprojeto-duas-aguas.json", backup);
  });
  it("liga quantitativos, preserva preços e invalida orçamento quando a geometria muda", () => {
    let p = planningExample(); for (const profile of Object.values(p.planning!.profiles)) profile.pricePerMeterCents = 1000;
    p = transferTakeoff(p, 0); expect(calculateEstimate(p).saleCents).not.toBeNull();
    const signature = structureSignature(p), oldId = p.estimate.materials[0].id; p.estimate.materials[0].unitPriceCents = 2000;
    p.roof.widthM = 12; expect(structureSignature(p)).not.toBe(signature); expect(calculateEstimate(p).saleCents).toBeNull();
    p = transferTakeoff(p, 0); expect(p.estimate.materials).toHaveLength(5); expect(p.estimate.materials[0].id).toBe(oldId); expect(p.estimate.materials[0].unitPriceCents).toBe(2000);
    expect(calculateEstimate(p).saleCents).not.toBeNull();
  });
  it("migra v3 sem gravar ou perder dados e faz backup das novas propriedades", () => {
    const p = planningExample(); const { workspace: _w, revisions: _r, ...legacy } = p; void _w; void _r;
    const old = { ...emptySnapshot(), version: 3, projects: [legacy] }, raw = JSON.stringify(old); let saved = raw;
    const repo = new LocalRepositories({ getItem: () => saved, setItem: (_, value) => { saved = value; } });
    const loaded = repo.load(); expect(loaded.version).toBe(4); expect(saved).toBe(raw); expect(loaded.projects[0].workspace.analysis).toBeNull();
    expect(migrateSnapshot(old).projects[0].estimate).toEqual(p.estimate);
    expect(parseBackup(serializeBackup(loaded)).data).toEqual(loaded);
  });
  it("captura revisão independente e impede alteração/remoção de registros anteriores", () => {
    const memory = new Map<string, string>(), repo = new LocalRepositories({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } }); repo.load();
    const p = captureRevision(planningExample(), "R01", "Engenheiro de teste"); repo.projects.save(p); p.roof.widthM = 15;
    expect(p.revisions[0].roof.widthM).toBe(10); repo.projects.save(p);
    p.revisions[0].label = "Alterado"; expect(() => repo.projects.save(p)).toThrow(/imutáveis/);
    p.revisions = []; expect(() => repo.projects.save(p)).toThrow(/imutáveis/);
  });
  it("não grava um conjunto que excederia a capacidade de restauração do backup", () => {
    const memory = new Map<string, string>(), repo = new LocalRepositories({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } }); repo.load();
    const p = planningExample(); repo.projects.save(p);
    const before = repo.snapshot();
    p.workspace.fabrication = Array.from({ length: 60 }, (_, i) => ({ pieceId: `P${i}`, lengthMm: 1000, signature: "x".repeat(100000), note: "Teste de limite" }));
    expect(() => repo.projects.save(p)).toThrow(/5 MB/); expect(repo.snapshot()).toEqual(before);
  });
});
