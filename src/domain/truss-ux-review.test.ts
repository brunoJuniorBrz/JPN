import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { resolveSection, visualProfileFromDesignation } from "./profile-section";
import { catalogDesignations, studioModelFromPhysical } from "./studio-result-layers";
import { resolvePhysicalStructure } from "./physical-structure";
import { applyTrussToProject, blankTruss, fitPurlins, purlinPositions, roofPurlinPositions, trussIssues, trussLengthMm, trussSummary } from "./truss-editor";

const gaps = (xs: number[]) => xs.slice(1).map((x, i) => Math.round(x - xs[i]));

describe("terças alinhadas aos montantes", () => {
  it("obra nova não abre com aviso de trecho sem terça", () => {
    const t = blankTruss();
    expect(trussIssues(t).map(i => i.message).join(" ")).not.toMatch(/intervalo|ajustada/);
    const s = purlinPositions(t).map(p => p.sMm);
    expect(gaps(s).slice(1).every(g => g === t.purlinStepMm)).toBe(true);
  });

  it("barracão 12×20 duas águas: espaçamento igual, sem alternar 50/100 cm", () => {
    const base = { ...blankTruss(), roofKind: "two-slopes" as const, spanMm: 12000, lengthMm: 20000, trusses: 5 };
    const t = { ...base, ...fitPurlins(base, trussLengthMm(base), 770) };
    expect(t.purlinStepMm % t.panelMm).toBe(0);
    const half = purlinPositions(t);
    expect(half.every(p => Math.abs(p.shiftMm) < 1)).toBe(true);
    const inner = gaps(half.map(p => p.sMm)).slice(1);
    expect(new Set(inner).size).toBe(1);
    expect(trussIssues(t).filter(i => i.level === "erro")).toEqual([]);
    expect(roofPurlinPositions(t).length).toBe(2 * t.purlinLines - 1);
  });

  it("montantes contados da ponta mantêm a divisão por igual (sem módulo)", () => {
    const t = { ...blankTruss(), countFrom: "low" as const };
    const f = fitPurlins(t, 5400, 1000);
    expect(f).toEqual({ purlinLines: 7, purlinStepMm: 900 });
  });
});

describe("perfis do editor no 3D (só visual)", () => {
  it("lê U, Ue, L em polegada e tubo", () => {
    expect(resolveSection(visualProfileFromDesignation("U 100x40x2.65 mm")!).section).toMatchObject({ family: "channel", height: 100, width: 40, t: 2.65 });
    expect(resolveSection(visualProfileFromDesignation("Ue 75x40x15x2.65 mm")!).section).toMatchObject({ family: "channel", height: 75, width: 40 });
    expect(resolveSection(visualProfileFromDesignation("L 7/8 x 1/8 pol")!).section).toMatchObject({ family: "angle", width: 22.23, t: 3.18 });
    expect(resolveSection(visualProfileFromDesignation("Tubo 100x100x3.00 mm")!).section).toMatchObject({ family: "square-tube", width: 100, t: 3 });
    expect(visualProfileFromDesignation("Perfil qualquer")).toBeNull();
  });

  it("obra criada pelo editor mostra todas as peças com seção, sem mudar massa nem cálculo", () => {
    const p = applyTrussToProject(newProject(), blankTruss());
    const model = studioModelFromPhysical(resolvePhysicalStructure(p).model!, catalogDesignations(p.workspace.spatialPreparation?.physicalCatalog));
    expect(model.pieces.every(x => resolveSection(x.profile).section)).toBe(true);
    expect(model.pieces.every(x => x.massKg === null && x.profile.massKgM === null)).toBe(true);
    expect(trussSummary(blankTruss()).kg.total).toBeGreaterThan(0);
  });
});
