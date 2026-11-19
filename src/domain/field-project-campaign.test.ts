/**
 * Casos de campo para confrontar dimensoes publicas e modelos do motor JPN.
 *
 * FONTES:
 * - Camara de Itapoa SC, cobertura de garagem 5,00 x 5,50 m (27,50 m2):
 *   https://www.camaraitapoa.sc.gov.br/contratacao-direta-dispensa-de-licitacao/1398-contratacao-de-empresa-especializada-para-fabricacao-transporte-e-instalacao-de-cobertura-metalica-para-vaga-de-garagem.html
 * - Prefeitura de Presidente Juscelino MG, projeto de 200 m2, planta 10 x 20 m
 *   e cinco tesouras: https://bkp.presidentejuscelino.mg.gov.br/wp-content/uploads/2022/07/Anexos-TP-0112022-Assinado.pdf
 * - UFPB, Leite (2016): galpao de 19,87 x 49,40 m, 10 modulos de 4,94 m,
 *   cobertura a 18,55 graus e V0 historico de 30 m/s:
 *   https://ct.ufpb.br/ccec/contents/documentos/tccs/copy_of_2016.1/analise-dos-esforcos-atuantes-em-um-galpao-metalico-devido-a-acao-do-vento.pdf
 *
 * METODO: dimensoes publicas viram oraculos geometricos; parametros nao
 * publicados (perfis, altura de montagem, fixacao, cargas atuais) sao
 * HIPOTESES DE TESTE e nunca declaracoes sobre o projeto executado.
 * Estudos antigos nao substituem revisao pela edicao normativa atual.
 * NENHUM caso emite aprovacao resistente ou autorizacao de fabricacao.
 */
import { describe, expect, it } from "vitest";
import { createQuickProject } from "./quick-project";
import { generateStructure } from "./calculations/structure";
import { calculateWindSpeed } from "./wind-speed";
import { structureSignature } from "./calculations/project-basis";
import { distributeRoofActions } from "./roof-load-path";
import { newProject } from "./models";
import {
  addTrussType, applyTrussToProject, lineTypeId, roofPurlinPositions,
  trussDefaultsFor, trussIssues, trussOfLine, trussPiecesComplete, trussSummary,
} from "./truss-editor";

const cases = [
  { name: "Itapoa 5 x 5,5 (geometria publica)", typology: "mono", widthM: 5, lengthM: 5.5, heightM: 3, slopePercent: 8, frameSpacingM: 2.75, purlinSpacingM: 1.0, areaM2: 27.5 },
  { name: "Presidente Juscelino 10 x 20", typology: "gable", widthM: 10, lengthM: 20, heightM: 4, slopePercent: 15, frameSpacingM: 5, purlinSpacingM: 1.0, areaM2: 200 },
  { name: "UFPB 19,87 x 49,40", typology: "gable", widthM: 19.87, lengthM: 49.4, heightM: 6.85, slopePercent: Math.tan(18.55 * Math.PI / 180) * 100, frameSpacingM: 4.94, purlinSpacingM: 1.5, areaM2: 981.578 },
  { name: "limite sintetico 40 x 100", typology: "gable", widthM: 40, lengthM: 100, heightM: 11.67, slopePercent: 12, frameSpacingM: 10, purlinSpacingM: 2, areaM2: 4000 },
] as const;

describe("campanha de referencias externas: geometria de garagem a galpao", () => {
  for (const c of cases) {
    it(c.name + ": gera modelo visual sem inventar perfil resistente", () => {
      const p = createQuickProject({
        typology: c.typology, widthM: c.widthM, lengthM: c.lengthM,
        heightM: c.heightM, slopePercent: c.slopePercent,
        frameSpacingM: c.frameSpacingM, purlinSpacingM: c.purlinSpacingM,
      });
      expect(p.roof.widthM! * p.roof.lengthM!).toBeCloseTo(c.areaM2, 6);
      expect(p.planning!.typology).toBe(c.typology);
      expect(p.technicalNotes).toMatch(/sem cálculo de vento/);
      expect(p.planning!.profiles.topChord.massKgM).toBeNull();
      expect(p.planning!.profiles.topChord.data?.elasticModulusGpa).toBeNull();
      const model = generateStructure(p).model;
      expect(model).not.toBeNull();
      expect(model!.pieces.some(piece => piece.role === "purlin")).toBe(true);
      expect(model!.pieces.some(piece => piece.role === "topChord")).toBe(true);
    });
  }

  it("projeto publico 10x20: cinco tesouras, faces distintas, terças e apoios pendentes", () => {
    const preliminary = createQuickProject({
      typology: "gable", widthM: 10, lengthM: 20, heightM: 4,
      slopePercent: 15, frameSpacingM: 5, purlinSpacingM: 1,
    });
    const t = trussDefaultsFor(preliminary);
    expect([t.spanMm, t.lengthMm, t.trusses, t.roofKind]).toEqual([10000, 20000, 5, "two-slopes"]);
    expect(trussIssues(t).filter(issue => issue.level === "erro")).toEqual([]);
    expect(trussSummary(t).areaM2).toBe(200);
    const result = applyTrussToProject(preliminary, t);
    const faces = result.workspace.spatialPreparation!.physicalRoofFaces!.faces;
    expect(faces).toHaveLength(2);
    const roofLines = roofPurlinPositions(t);
    expect(result.workspace.physicalStructure!.pieces.filter(piece => piece.role === "purlin"))
      .toHaveLength(roofLines.length * (t.trusses - 1));
    expect(result.workspace.spatialPreparation!.supports).toHaveLength(10);
    expect(result.workspace.spatialPreparation!.supports.every(s => s.dofs.every(d => d === "pending"))).toBe(true);
    expect(result.workspace.cutting.useFabrication).toBe(false);
  });

  it("cinco tesouras com duas tipologias nas pontas: desenho por linha sem duplicar cumeeira", () => {
    const preliminary = createQuickProject({
      typology: "gable", widthM: 10, lengthM: 20, heightM: 4,
      slopePercent: 15, frameSpacingM: 5, purlinSpacingM: 1,
    });
    let t = addTrussType(trussDefaultsFor(preliminary));
    t = {
      ...t, types: t.types.map(type => ({ ...type, name: "Ponta", panelMm: 750, diagonal: "x" as const })),
      lineTypes: ["T2", "T1", "T1", "T1", "T2"],
    };
    expect(t.lineTypes.map((_, i) => lineTypeId(t, i))).toEqual(["T2", "T1", "T1", "T1", "T2"]);
    expect(trussIssues(t).filter(issue => issue.level === "erro")).toEqual([]);
    const centerX = t.spanMm / 2;
    for (let i = 0; i < t.trusses; i++) {
      const pieces = trussPiecesComplete(trussOfLine(t, i));
      expect(pieces.filter(piece => piece.kind === "M" && Math.abs(piece.a[0] - centerX) < 1e-6)).toHaveLength(1);
    }
    const result = applyTrussToProject(preliminary, t);
    expect(result.workspace.trussEditor!.lineTypes).toEqual(t.lineTypes);
    expect(result.workspace.spatialPreparation!.supports.every(s => s.dofs.every(d => d === "pending"))).toBe(true);
    expect(result.workspace.cutting.useFabrication).toBe(false);
  });

  it("UFPB: 49,40 m / 4,94 m sao 10 modulos e 11 linhas; sem forcar emendas comerciais", () => {
    const p = createQuickProject({
      typology: "gable", widthM: 19.87, lengthM: 49.4, heightM: 6.85,
      slopePercent: Math.tan(18.55 * Math.PI / 180) * 100,
      frameSpacingM: 4.94, purlinSpacingM: 1.5,
    });
    const t = trussDefaultsFor(p);
    expect(t.trusses).toBe(11);
    expect(t.lengthMm / (t.trusses - 1)).toBeCloseTo(4940, 8);
    expect(t.spanMm).toBe(19870);
    expect(t.roofKind).toBe("two-slopes");
    expect(trussIssues(t).filter(issue => issue.message.includes("excede a barra comercial"))).toEqual([]);
  });

  it("terca sem apoio/com vao maior que a barra nao ganha emenda ficticia", () => {
    const t = trussDefaultsFor(createQuickProject({
      typology: "gable", widthM: 10, lengthM: 20, heightM: 4,
      frameSpacingM: 5, purlinSpacingM: 1,
    }));
    const unsafe = { ...t, trusses: 2 };
    expect(trussIssues(unsafe).some(i => i.level === "erro" && i.message.includes("excede a barra comercial"))).toBe(true);
    expect(() => applyTrussToProject(newProject(), unsafe)).toThrow(/excede a barra comercial/);
  });
});

describe("campanha de vento e caminho das cargas da cobertura", () => {
  const reference = {
    standard: "ABNT NBR 6123", edition: "2023-corrected-2025",
    clause: "4.2; 5.3.3", source: "Cenario de teste independente, sem enquadramento automatico de terreno", revision: "1", responsible: "Campanha JPN",
  } as const;
  const input = {
    schema_version: "jpn.wind-speed/1", edition: "2023-corrected-2025",
    v0Mps: 30, heightM: 10, heightReference: "model-base-z0",
    topography: "flat-or-gently-undulating", roughnessTransition: "none",
    category: "II", sizeClass: "A", s3: 1, reference,
  } as const;

  it("vento de 30/40/45 m/s: pressao q=0,613 Vk2 e crescimento quadratico", () => {
    const a = calculateWindSpeed(input);
    const b = calculateWindSpeed({ ...input, v0Mps: 40 });
    const c = calculateWindSpeed({ ...input, v0Mps: 45 });
    expect(a.dynamicPressurePa).toBeCloseTo(0.613 * a.vkMps ** 2, 9);
    expect(b.dynamicPressurePa / a.dynamicPressurePa).toBeCloseTo(16 / 9, 10);
    expect(c.dynamicPressurePa / a.dynamicPressurePa).toBeCloseTo(2.25, 10);
    expect(a.completeWindAssessment).toBe(false);
    expect(a.computedStructuralApproval).toBe(false);
  });

  it("fator de ocupacao S3 afeta Vk linear e q quadraticamente", () => {
    const a = calculateWindSpeed(input);
    const b = calculateWindSpeed({ ...input, s3: 0.9 });
    expect(b.vkMps / a.vkMps).toBeCloseTo(0.9, 10);
    expect(b.dynamicPressurePa / a.dynamicPressurePa).toBeCloseTo(0.81, 10);
  });

  for (const typology of ["mono", "gable"] as const) {
    for (const direction of [-1, 1] as const) {
      it(typology + " / " + (direction < 0 ? "gravidade" : "succao") + ": conserva area, forca e momento nas tercas", () => {
        const p = createQuickProject({
          typology, widthM: 6, lengthM: 8, heightM: 3,
          slopePercent: 10, frameSpacingM: 4, purlinSpacingM: 1,
        });
        p.planning!.overhangStartM = 0;
        p.planning!.overhangEndM = 0;
        const trace = distributeRoofActions(p, [{
          caseId: "PRESSAO-DECLARADA", knM2: 0.75,
          projection: "horizontal", direction: [0, 0, direction],
          source: "Carga de verificacao de conservacao, nao retirada do projeto real",
          revision: "1", loadPath: "Faixas de influencia das tercas declaradas",
        }], {
          version: 1, method: "parallel-purlin-strips",
          geometrySignature: structureSignature(p),
        });
        const a = trace.actions[0], expectedN = direction * 0.75 * 1000 * 48;
        expect(a.areaM2).toBeCloseTo(48, 8);
        expect(a.distributedAreaM2).toBeCloseTo(48, 8);
        expect(a.expectedForceN[2]).toBeCloseTo(expectedN, 6);
        expect(a.distributedForceN[2]).toBeCloseTo(expectedN, 6);
        a.distributedMomentNm.forEach((moment, i) =>
          expect(moment).toBeCloseTo(a.expectedMomentNm[i], 6));
        expect(a.loads.length).toBeGreaterThan(0);
      });
    }
  }

  it("recusa hipotese de vento sem referencia normativa completa, em vez de inventar valor", () => {
    expect(() => calculateWindSpeed({ ...input, v0Mps: 0 })).toThrow();
    expect(() => calculateWindSpeed({ ...input, category: "VI" })).toThrow();
    expect(() => calculateWindSpeed({ ...input, s3: Number.NaN })).toThrow();
  });
});
