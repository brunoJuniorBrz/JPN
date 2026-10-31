import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { projectSchema, migrateSnapshot, emptySnapshot } from "./models";
import { parseBackup, serializeBackup } from "@/infrastructure/persistence/local";
import { structureSignature } from "./calculations/project-basis";
import { baseNodeIds, newSpatialPreparation, spatialPreparationReview, spatialPreparationSchema, pieceRoles } from "./spatial-preparation";
import { generateStructure } from "./calculations/structure";

describe("preparação estrutural editável — dados físicos distintos do 3D", () => {
  const project = () => createQuickProject({ typology: "gable", widthM: 10, lengthM: 20, heightM: 4 });
  it("inicia sem aço, seção, aço resistente, apoios, ligações ou cargas inventadas", () => {
    const p = project(), d = newSpatialPreparation(p);
    expect(spatialPreparationSchema.parse(d)).toEqual(d);
    for (const role of pieceRoles) {
      expect(d.groups[role].eGpa).toBeNull();
      expect(d.groups[role].areaCm2).toBeNull();
      expect(d.groups[role].jCm4).toBeNull();
      expect(d.groups[role].connection).toBe("pending");
    }
    expect(d.supports).toEqual([]); expect(d.loads).toEqual([]);
    expect(d.combinations[0].factors["CASO-1"]).toBeNull();
    const result = spatialPreparationReview(p, d);
    expect(result.analysisReady).toBe(false);
    expect(result.geometry?.pieces.length).toBeGreaterThan(100);
    for (const code of ["TOPOLOGY", "SUPPORTS", "PROPERTIES", "CONNECTION", "LOADS", "COMBINATIONS"]) {
      expect(result.issues.some(i => i.code === code)).toBe(true);
    }
  });
  it("calcula IDs de bases pela geometria e não fixa automaticamente nenhum grau", () => {
    const p = project(), model = generateStructure(p).model!;
    const ids = baseNodeIds(model);
    expect(ids).toHaveLength(model.frameCount * 2);
    expect(ids.every(id => model.nodes.find(n => n.id === id)?.z === 0)).toBe(true);
    const draft = newSpatialPreparation(p);
    draft.supports = ids.map(nodeId => ({ nodeId, dofs: ["fixed", "fixed", "fixed", "free", "free", "free"] }));
    expect(spatialPreparationSchema.parse(draft).supports).toEqual(draft.supports);
    expect(spatialPreparationReview(p, draft).issues.some(i => i.code === "SUPPORTS")).toBe(false);
  });
  it("salva e recupera declarações pelo backup v4 sem perder outros dados", () => {
    const p = project(), d = newSpatialPreparation(p);
    d.groups.column.materialSource = "Catálogo fornecido pelo fabricante";
    d.groups.column.eGpa = 210;
    d.supports = [{ nodeId: baseNodeIds(generateStructure(p).model!)[0], dofs: ["fixed", "fixed", "fixed", "free", "free", "free"] }];
    d.loads.push({ id: crypto.randomUUID(), caseId: "CASO-1", nodeId: "N1", fxKn: 0, fyKn: 0, fzKn: -12, mxKnm: 0, myKnm: 0, mzKnm: 0 });
    p.workspace.spatialPreparation = d;
    expect(projectSchema.parse(p).workspace.spatialPreparation).toEqual(d);
    const state = { ...emptySnapshot(), projects: [p] };
    const restored = parseBackup(serializeBackup(state));
    expect(restored.data.projects[0].workspace.spatialPreparation).toEqual(d);
    expect(restored.data.projects[0].roof).toEqual(p.roof);
    const old = structuredClone(p); delete old.workspace.spatialPreparation;
    expect(migrateSnapshot({ ...state, projects: [old] }).projects[0].workspace.spatialPreparation).toBeUndefined();
  });
  it("conserva declarações e invalida vínculo após edição de medidas, perfis ou espaçamentos", () => {
    const p = project(); p.workspace.spatialPreparation = newSpatialPreparation(p);
    const d = p.workspace.spatialPreparation;
    expect(d.geometrySignature).toBe(structureSignature(p));
    p.planning!.frameSpacingM = 3;
    const status = spatialPreparationReview(p, d);
    expect(status.stale).toBe(true); expect(status.analysisReady).toBe(false);
    expect(status.issues.some(i => i.code === "STALE_GEOMETRY")).toBe(true);
    expect(d.geometrySignature).not.toBe(structureSignature(p));
    expect(d.groups.web.connection).toBe("pending");
  });
  it("reconhece declarações físicas completas sem liberar cálculo ou fabricação enquanto falta conectividade", () => {
    const p = project(), d = newSpatialPreparation(p), model = generateStructure(p).model!;
    for (const role of pieceRoles) d.groups[role] = {
      steelGrade: "Aço informado pelo usuário", materialSource: "Ficha de material", materialRevision: "2026",
      eGpa: 200, gGpa: 200 / (2 * 1.3), nu: 0.3,
      areaCm2: 50, iyCm4: 300, izCm4: 150, jCm4: 25, sectionSource: "Ficha de seção", sectionRevision: "2026",
      rotationDeg: 0, connection: "rigid",
    };
    d.supports = baseNodeIds(model).map(nodeId => ({ nodeId, dofs: ["fixed", "fixed", "fixed", "free", "free", "free"] }));
    d.cases[0].source = "Fixture de teste; não é vento calculado";
    d.loads = [{ id: crypto.randomUUID(), caseId: "CASO-1", nodeId: model.nodes[0].id,
      fxKn: 0, fyKn: 0, fzKn: -1, mxKnm: 0, myKnm: 0, mzKnm: 0 }];
    d.combinations[0].factors["CASO-1"] = 1;
    d.connectionsReview = "Hipótese de nós rígidos explicitamente declarada";
    d.lateralSystem = "Exemplo de sistema declarado para teste";
    d.loadPathReview = "Ação aplicada no nó indicado, revisar com engenheiro";
    const review = spatialPreparationReview(p, d);
    expect(review.issues.map(i => i.code)).toEqual(["TOPOLOGY"]);
    expect(review.declarationsComplete).toBe(true);
    expect(review.analysisReady).toBe(false);
  });
});
