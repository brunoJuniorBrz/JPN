import { describe, expect, it } from "vitest";
import { planningExample } from "../planning-example";
import { generateStructure, structureViews } from "./structure";
import { roles } from "../structure";
import { emptySnapshot, migrateSnapshot } from "../models";
import { exampleProject } from "../example";
import { LocalRepositories, parseBackup, serializeBackup, STORAGE_KEY } from "@/infrastructure/persistence/local";

describe("modelo central de peças", () => {
  it("gera 5 linhas em 20 m, área inclinada e 123 peças identificadas", () => {
    const result = generateStructure(planningExample()), m = result.model!;
    expect(m.frameCount).toBe(5); expect(m.frameSpacingM).toBe(5);
    expect(m.roofAreaM2).toBeCloseTo(200.9975124224, 8);
    expect(m.purlinRows).toBe(7); expect(m.purlinSpacingM).toBeLessThanOrEqual(2);
    expect(m.pieces).toHaveLength(123);
    expect(m.pieces.filter(p => p.role === "column")).toHaveLength(10);
    expect(m.pieces.filter(p => p.role === "purlin")).toHaveLength(28);
    expect(m.pieces.filter(p => p.role === "topChord")).toHaveLength(20);
    expect(m.pieces.find(p => p.id === "P1")!.lengthMm).toBe(3200);
    expect(m.pieces.find(p => p.id === "T1-BS1")!.lengthMm).toBeCloseTo(Math.hypot(2500, 250), 9);
    expect(result.pending).toEqual([]);
  });
  it("conserva peças, comprimentos e massa na consolidação e nas vistas", () => {
    const project = planningExample(), result = generateStructure(project), m = result.model!;
    expect(new Set(m.pieces.map(p => p.id)).size).toBe(m.pieces.length);
    expect(new Set(m.pieces.map(p => [p.start, p.end].sort().join(":"))).size).toBe(m.pieces.length);
    expect(m.pieces.every(p => p.lengthMm > 0)).toBe(true);
    expect(m.groups.flatMap(g => g.pieceIds).sort()).toEqual(m.pieces.map(p => p.id).sort());
    expect(m.groups.reduce((sum, g) => sum + g.totalLengthM, 0)).toBeCloseTo(m.totalLengthM, 9);
    expect(m.groups.reduce((sum, g) => sum + g.massKg!, 0)).toBeCloseTo(m.knownMassKg, 8);
    const manualMass = roles.reduce((sum, role) => sum + m.pieces.filter(p => p.role === role).reduce((n, p) => n + p.lengthMm / 1000, 0) * project.planning!.profiles[role].massKgM!, 0);
    expect(m.knownMassKg).toBeCloseTo(manualMass, 9);
    const view = structureViews(project, result)!;
    for (const v of Object.values(view.views)) expect(v.entities.filter(e => e.pieceId).map(e => e.pieceId).sort()).toEqual(m.pieces.map(p => p.id).sort());
    expect(generateStructure(project)).toEqual(result);
  });
  it("inverte a queda e troca eixos sem perder a identidade ou os totais", () => {
    const p = planningExample(), m = generateStructure(p).model!;
    p.roof.fall = "width-negative"; const reverse = generateStructure(p).model!;
    expect(reverse.roofAreaM2).toBe(m.roofAreaM2);
    expect(reverse.pieces.length).toBe(m.pieces.length);
    p.roof = { ...p.roof, widthM: 20, lengthM: 10, fall: "length-positive" };
    const rotated = generateStructure(p).model!;
    expect(rotated.totalLengthM).toBeCloseTo(m.totalLengthM, 8);
    expect(rotated.nodes.map(n => [n.y, n.x, n.z])).toEqual(m.nodes.map(n => [n.x, n.y, n.z]));
  });
  it("mantém resultado com perfis pendentes, sem inventar massa ou aprovação", () => {
    const p = planningExample(); p.planning!.profiles.column.massKgM = null; p.planning!.profiles.web.name = "";
    const result = generateStructure(p); expect(result.model).not.toBeNull(); expect(result.model!.massComplete).toBe(false);
    expect(result.model!.groups.filter(g => g.role === "column").every(g => g.massKg === null)).toBe(true);
    expect(result.pending).toContain("Diagonais e montantes: perfil não definido.");
    expect(result.notes.some(n => n.includes("Resistência"))).toBe(true);
  });
  it("trata medidas ausentes, impossíveis, limites e comprimentos comerciais insuficientes", () => {
    const p = planningExample(); p.planning!.frameSpacingM = null; expect(generateStructure(p).model).toBeNull();
    p.planning!.frameSpacingM = .001; expect(generateStructure(p).pending[0]).toContain("excede");
    p.planning!.frameSpacingM = 5; p.planning!.trussDepthM = 4; expect(generateStructure(p).model).toBeNull();
    p.planning!.trussDepthM = .8; p.planning!.profiles.purlin.stockLengthM = 3;
    expect(generateStructure(p).pending.some(n => n.includes("maiores que o comprimento comercial"))).toBe(true);
    p.roof.widthM = null; expect(generateStructure(p).model).toBeNull();
  });
  it("não ultrapassa espaçamentos máximos perto de um múltiplo inteiro", () => {
    const p = planningExample();
    p.roof.lengthM = 20.0000000001;
    p.roof.widthM = 10.0000000001;
    p.roof.slopePercent = 0;
    const m = generateStructure(p).model!;
    expect(m.frameSpacingM).toBeLessThanOrEqual(p.planning!.frameSpacingM!);
    expect(m.purlinSpacingM).toBeLessThanOrEqual(p.planning!.purlinSpacingM!);
    expect(m.frameCount).toBe(6);
    expect(m.purlinRows).toBe(7);
  });
});

describe("migração do levantamento", () => {
  it("preserva orçamento v2 e só grava a versão nova na próxima gravação", () => {
    const project = exampleProject();
    const { planning: _planning, workspace: _workspace, revisions: _revisions, ...legacyProject } = project; void _planning; void _workspace; void _revisions;
    const old = { ...emptySnapshot(), version: 2, exampleInstalled: true, projects: [legacyProject] };
    const original = JSON.stringify(old); let raw = original;
    const repo = new LocalRepositories({ getItem: () => raw, setItem: (_key, value) => { raw = value; } });
    const data = repo.load(); expect(data.version).toBe(4); expect(data.projects[0].planning).toBeNull();
    expect(data.projects[0].estimate).toEqual(project.estimate); expect(raw).toBe(original);
    repo.projects.save(data.projects[0]); expect(JSON.parse(raw).version).toBe(4);
    expect(migrateSnapshot(old).projects[0].roof).toEqual(project.roof);
    expect(STORAGE_KEY).toBe("jpn-projetos:v1");
  });
  it("preserva configuração no backup, duplicação e importação sem compartilhar objetos", () => {
    const values = new Map<string, string>();
    const repo = new LocalRepositories({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } }); repo.load();
    const p = planningExample(); repo.projects.save(p); const copy = repo.projects.duplicate(p.id);
    expect(copy.planning).toEqual(p.planning); expect(copy.id).not.toBe(p.id);
    copy.planning!.profiles.column.name = "Alterado"; repo.projects.save(copy);
    expect(repo.projects.list().find(item => item.id === p.id)!.planning!.profiles.column.name).not.toBe("Alterado");
    const backup = parseBackup(serializeBackup(repo.snapshot())); repo.importBackup(backup);
    expect(repo.projects.list()).toHaveLength(4);
    expect(repo.projects.list()[2].planning).toEqual(p.planning);
  });
});
