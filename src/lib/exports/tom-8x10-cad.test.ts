/**
 * Obra nova do Tom (18/11/2026): cobertura de UMA ÁGUA, 8 m de largura por
 * 10 m de comprimento, 3 tesouras, 6 linhas de terças de 10 m, telha simples
 * TR40 0,50 mm, caída de 10 %, calha de 40 cm (não orçada), mão de obra
 * R$ 50/m². Pedido em paralelo ao Alan: comparar depois.
 *
 * Geometria gerada pelo gerador de uma água do JPN (generateStructure) e
 * transferida para estrutura declarada. Premissas NÃO informadas pelo Tom
 * estão em PREMISSAS e saem nas notas das pranchas. Estudo de conferência:
 * sem cargas, sem dimensionamento, todos os bloqueios mantidos.
 */
import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createQuickProject } from "@/domain/quick-project";
import { generateStructure } from "@/domain/calculations/structure";
import { declaredStructureSchema } from "@/domain/declared-structure";
import { physicalRoofFacesSchema, inspectPhysicalRoofFaces } from "@/domain/physical-roof-faces";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { transferDeclaredTakeoff } from "@/domain/declared-takeoff";
import { packageTakeoff } from "./package-source";
import { declaredCommercialGroups } from "./package-commercial-groups";
import { createCompletePackage, packageCutting } from "./complete-package";

const REV = "TOM-8X10-1";
const SOURCE = "Pedido do Tom por WhatsApp em 18/11/2026: uma água 8 x 10 m, 3 tesouras, 6 terças de 10 m, TR40 0,50, caída 10 %, calha 40 cm";
/** Dados informados pelo Tom. */
const OBRA = { larguraM: 8, comprimentoM: 10, tesouras: 3, linhasTercas: 6, caidaPercent: 10 } as const;
/** Premissas do JPN (não informadas): saem nas notas e no relatório. */
const PREMISSAS = {
  apoio: "Tesouras apoiadas nas duas pontas (parede ou pilar a confirmar); sem pilares no desenho",
  zApoioMm: 3000, // referência de desenho, NÃO medida da obra
  alturaTesouraBaixaMm: 300, // mesma prática da tesoura anterior do Tom/Alan
  paineis: 5, // 1,60 m: cada terça cai num nó da tesoura
  diagonais: "uma diagonal por painel (gerador JPN); o Tom confirmou que usa diagonal em cantoneira",
  // Tom, 18/11 06:36-06:40: tesoura "de 4 pol no 2,65", diagonais em cantoneira 7/8 x 1/8,
  // terças "U enrijecido de 2,65" (altura NÃO informada: mantido Ue 75, a confirmar).
  perfilTesoura: "U 100x40x2.65 mm",
  perfilAlma: "L 7/8 x 1/8 pol (22,2 x 3,2 mm)",
  perfilTerca: "Ue 75x40x15x2.65 mm",
  barraM: 6,
  // Banzo = uma barra inteira (6000 menos acabamento das pontas e serra) + o restante.
  // Emenda no nó (4,80 + 3,20) gastava 12 barras de U 4"; assim são 9.
  emendaBanzoMm: 5980,
  telhaLarguraUtilMm: 1020, // Tom: "TR40 1020"
  telhaPrecoMetroCentavos: 4400, // Tom: R$ 44 a TR40 0,50 (por metro)
  insumosCentavos: 110000, // Tom: insumo R$ 1.100
  telhaAvancoCalhaMm: 100,
  precoBarraUe: 15500, precoBarraU: 13500, // centavos; orçamento do Alan nov/2026
} as const;
// U 100x40x2,65: massa publicada 3,54 kg/m (catálogo JPN P048) -> área equivalente a 7850 kg/m³.
const AREA_U100_CM2 = 3.54 / 7850 * 1e4;
// Cantoneira 7/8" x 1/8" (22,225 x 3,175 mm), área nominal sem raios (~1,03 kg/m).
const AREA_L78_CM2 = (2 * 22.225 - 3.175) * 3.175 / 100;
// Área pela linha média, sem raios de dobra (nominal). Fornecedor pode diferir ~2 %.
const AREA_UE75_CM2 = (75 - 2.65 + 2 * (40 - 2.65) + 2 * (15 - 1.325)) * 2.65 / 100;

export function buildTom8x10() {
  const p = createQuickProject({
    typology: "mono", widthM: OBRA.larguraM, lengthM: OBRA.comprimentoM,
    heightM: (PREMISSAS.zApoioMm + PREMISSAS.alturaTesouraBaixaMm) / 1000, slopePercent: OBRA.caidaPercent,
    name: "Tom - cobertura uma água 8 x 10 m - TR40",
    client: "Obra do Tom (cliente a informar)",
    frameSpacingM: OBRA.comprimentoM / (OBRA.tesouras - 1),
    // 6 linhas = 5 vãos ao longo da água inclinada
    purlinSpacingM: Math.ceil(Math.hypot(OBRA.larguraM, OBRA.larguraM * OBRA.caidaPercent / 100) / (OBRA.linhasTercas - 1) * 100) / 100,
    panels: PREMISSAS.paineis,
  });
  p.roof.fall = "width-negative"; // lado baixo em X=0
  p.planning!.trussDepthM = PREMISSAS.alturaTesouraBaixaMm / 1000;
  p.planning!.overhangStartM = 0;
  p.planning!.overhangEndM = 0;
  const generated = generateStructure(p).model;
  if (!generated) throw Error("Gerador JPN não produziu a geometria: " + generateStructure(p).pending.join("; "));

  // Sem pilares: apoio a confirmar. Banzos contínuos com UMA emenda depois de
  // uma barra inteira (como se fabrica), em vez de um segmento por painel.
  // A emenda fica fora de nó: solda de topo + reforço a verificar.
  const extraNodes: { id: string; x: number; y: number; z: number }[] = [];
  type Piece = { id: string; role: "topChord" | "bottomChord" | "web" | "purlin"; start: string; end: string; label: string; group: string };
  const pieces: Piece[] = [];
  for (let f = 1; f <= OBRA.tesouras; f++) {
    for (const [role, key, label] of [["bottomChord", "BI", "Banzo inferior"], ["topChord", "BS", "Banzo superior"]] as const) {
      const segs = Array.from({ length: PREMISSAS.paineis }, (_, i) => generated.pieces.find(q => q.id === `T${f}-${key}${i + 1}`)!);
      const a = generated.nodes.find(n => n.id === segs[0].start)!, b = generated.nodes.find(n => n.id === segs.at(-1)!.end)!;
      const t = PREMISSAS.emendaBanzoMm / Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const splice = { id: `T${f}-${key}-EMENDA`, x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) };
      extraNodes.push(splice);
      pieces.push({ id: `T${f}-${key}-A`, role, start: a.id, end: splice.id, label: `${label} ${PREMISSAS.perfilTesoura}`, group: "TESOURA" });
      pieces.push({ id: `T${f}-${key}-B`, role, start: splice.id, end: b.id, label: `${label} ${PREMISSAS.perfilTesoura}`, group: "TESOURA" });
    }
    for (const q of generated.pieces.filter(q => q.id.startsWith(`T${f}-M`) || q.id.startsWith(`T${f}-D`)))
      pieces.push({ id: q.id, role: "web", start: q.start, end: q.end, label: `${q.id.includes("-M") ? "Montante" : "Diagonal"} ${PREMISSAS.perfilAlma}`, group: "TESOURA" });
  }
  for (const q of generated.pieces.filter(q => q.role === "purlin"))
    pieces.push({ id: q.id, role: "purlin", start: q.start, end: q.end, label: `Terça ${PREMISSAS.perfilTerca}`, group: "TERCAS" });
  const used = new Set(pieces.flatMap(q => [q.start, q.end]));
  // Generator Z puts the truss bottom at lowHeight - depth = 3000 mm.
  const nodes = [...generated.nodes.filter(n => used.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z })), ...extraNodes];

  p.name = "Tom - cobertura uma água 8 x 10 m - TR40";
  p.technicalNotes = [
    "ESTUDO DE CONFERÊNCIA. Sem cargas, vento, dimensionamento ou ligações. Não usar para fabricação.",
    `Dados do Tom: ${SOURCE}.`,
    `Premissas JPN a confirmar: ${PREMISSAS.apoio}; Z=${PREMISSAS.zApoioMm} mm é referência de desenho;`,
    `tesoura com ${PREMISSAS.alturaTesouraBaixaMm} mm no lado baixo, ${PREMISSAS.paineis} painéis de 1,60 m, ${PREMISSAS.diagonais};`,
    `banzos com emenda a ${PREMISSAS.emendaBanzoMm} mm da ponta baixa (barra inteira + restante), fora de nó: solda de topo e reforço a verificar;`,
    `perfis informados pelo Tom: banzos ${PREMISSAS.perfilTesoura}, montantes e diagonais ${PREMISSAS.perfilAlma}; terças ${PREMISSAS.perfilTerca} (altura a confirmar); nenhum verificado para 8 m e 5 m de vão;`,
    `telha TR40 0,50 simples, largura útil ${PREMISSAS.telhaLarguraUtilMm} mm, peça inteira na água com avanço de ${PREMISSAS.telhaAvancoCalhaMm} mm na calha.`,
    "Calha de 40 cm desenhada só como referência: fora do orçamento (o Tom não orça calhas).",
  ].join(" ");
  p.workspace.cutting = { kerfMm: 3, endTrimMm: 5, minimumRemnantMm: 300, useFabrication: false };
  p.workspace.physicalStructure = declaredStructureSchema.parse({
    schema_version: "jpn.declared-structure/1", source: "declared", units: "mm",
    provenance: `Gerador de uma água JPN + ${SOURCE}`, revision: REV, nodes, pieces,
  });
  const draft = newSpatialPreparation(p);
  const density = { kgM3: 7850, source: "Aço carbono, massa específica nominal 7850 kg/m³", revision: REV };
  draft.physicalCatalog = {
    schema_version: "jpn.physical-catalog/1",
    materials: [{ id: "ACO_TOM", steelGrade: "NAO-INFORMADO (perfil formado a frio comercial)", eGpa: null, gGpa: null, nu: null, density,
      materialSource: "Aço não especificado pelo Tom", materialRevision: REV }],
    sections: [
      { id: "U100", designation: "U 100x40x2.65 mm", areaCm2: Number(AREA_U100_CM2.toFixed(4)), iyCm4: null, izCm4: null, jCm4: null,
        sectionSource: "Massa publicada 3,54 kg/m (catálogo JPN P048, Dobraço); área equivalente", sectionRevision: REV },
      { id: "L78", designation: "L 7/8 x 1/8 pol", areaCm2: Number(AREA_L78_CM2.toFixed(4)), iyCm4: null, izCm4: null, jCm4: null,
        sectionSource: "Área nominal 22,2 x 3,2 mm sem raios (~1,03 kg/m); conferir catálogo do fornecedor", sectionRevision: REV },
      { id: "UE75", designation: "Ue 75x40x15x2.65 mm", areaCm2: Number(AREA_UE75_CM2.toFixed(4)), iyCm4: null, izCm4: null, jCm4: null,
        sectionSource: "Área nominal pela linha média, sem raios (3,63 kg/m); conferir catálogo do fornecedor", sectionRevision: REV },
    ],
    assignments: pieces.map(q => ({ pieceId: q.id, materialId: "ACO_TOM", sectionId: q.role === "purlin" ? "UE75" : q.role === "web" ? "L78" : "U100", rotationDeg: null })),
  };
  // Uma face: X 0..8000 (lado baixo em X=0), Y 0..10000, 10 % de caída,
  // no plano do banzo superior.
  const top = (x: number) => PREMISSAS.zApoioMm + PREMISSAS.alturaTesouraBaixaMm + x * OBRA.caidaPercent / 100;
  const W = OBRA.larguraM * 1000, L = OBRA.comprimentoM * 1000;
  draft.physicalRoofFaces = physicalRoofFacesSchema.parse({
    schema_version: "jpn.physical-roof-faces/1", units: "mm", source: SOURCE, revision: REV,
    faces: [{ id: "AGUA", source: `${SOURCE} / face única`, revision: REV, supportPieceIds: [],
      outer: [[0, 0, top(0)], [W, 0, top(W)], [W, L, top(W)], [0, L, top(0)], [0, 0, top(0)]] as [number, number, number][], holes: [] }],
  });
  p.workspace.spatialPreparation = draft;
  p.workspace.overallDimensionChecks = [
    { axis: "x", statedLengthMm: W, source: "Largura informada pelo Tom", revision: REV },
    { axis: "y", statedLengthMm: L, source: "Comprimento informado pelo Tom", revision: REV },
  ];
  return transferDeclaredTakeoff(p, 0);
}

/** Telhas, parafusos e mão de obra (fora do motor de aço). */
export function tom8x10Extras() {
  const slopeMm = Math.hypot(OBRA.larguraM * 1000, OBRA.larguraM * OBRA.caidaPercent * 10);
  const sheetLengthMm = Math.ceil((slopeMm + PREMISSAS.telhaAvancoCalhaMm) / 10) * 10; // corte de fábrica a cada 10 mm
  const sheets = Math.ceil(OBRA.comprimentoM * 1000 / PREMISSAS.telhaLarguraUtilMm);
  const perPurlin = 4, stitchMm = 500;
  const fixings = sheets * OBRA.linhasTercas * perPurlin;
  const stitches = (sheets - 1) * Math.ceil(slopeMm / stitchMm);
  const areaProjM2 = OBRA.larguraM * OBRA.comprimentoM, areaInclM2 = slopeMm / 1000 * OBRA.comprimentoM;
  return { slopeMm, sheetLengthMm, sheets, linearM: sheets * sheetLengthMm / 1000, fixings, stitches,
    sheetCostCents: Math.round(sheets * sheetLengthMm / 1000 * PREMISSAS.telhaPrecoMetroCentavos), insumosCents: PREMISSAS.insumosCentavos,
    screws: fixings + stitches, areaProjM2, areaInclM2, laborCents: Math.round(areaProjM2 * 5000),
    gutterM: OBRA.comprimentoM, gutterWidthMm: 400 };
}

it("Tom 8x10: gera pacote CAD completo pelo gerador de uma água do JPN (estudo, sem dimensionamento)", async () => {
  const p = buildTom8x10(), report = packageTakeoff(p), pieces = p.workspace.physicalStructure!.pieces;
  const trussIds = new Set(pieces.filter(q => q.role !== "purlin").map(q => q.id.split("-")[0]));
  expect(trussIds.size).toBe(OBRA.tesouras);
  // 6 linhas x 2 vãos de 5 m (emenda sobre a tesoura do meio)
  expect(pieces.filter(q => q.role === "purlin")).toHaveLength(OBRA.linhasTercas * (OBRA.tesouras - 1));
  // por tesoura: 2 BI + 2 BS + 6 montantes + 5 diagonais
  expect(pieces.filter(q => q.role !== "purlin")).toHaveLength(OBRA.tesouras * (4 + (PREMISSAS.paineis + 1) + PREMISSAS.paineis));
  const area = inspectPhysicalRoofFaces(p.workspace.spatialPreparation!.physicalRoofFaces!).faces.reduce((s, f) => s + f.horizontalAreaM2, 0);
  expect(area).toBeCloseTo(80, 6);
  // Terças nos nós: cada linha de terça coincide com um nó do banzo superior.
  const nodes = new Map(p.workspace.physicalStructure!.nodes.map(n => [n.id, n]));
  const purlinX = [...new Set(pieces.filter(q => q.role === "purlin").map(q => nodes.get(q.start)!.x))].sort((a, b) => a - b);
  expect(purlinX.map(x => Math.round(x))).toEqual([0, 1600, 3200, 4800, 6400, 8000]);
  for (const q of pieces) expect(Math.hypot(...(["x", "y", "z"] as const).map(k => nodes.get(q.end)![k] - nodes.get(q.start)![k]))).toBeLessThanOrEqual(PREMISSAS.barraM * 1000);

  const stockByGroup = Object.fromEntries(report.groups.map(g => [g.key, PREMISSAS.barraM * 1000]));
  // Só a terça tem preço de barra conhecido (orçamento anterior); U 4" e cantoneira: a informar.
  const barPriceCentsByGroup = Object.fromEntries(declaredCommercialGroups(p).filter(g => g.label.startsWith("Ue ")).map(g => [g.key, PREMISSAS.precoBarraUe]));
  const cut = packageCutting(p, { stockByGroup });
  const result = await createCompletePackage(p, { format: "A3", issuedAt: new Date("2026-11-18T09:30:00.000Z"), stockByGroup, barPriceCentsByGroup });
  expect(result.manifest.fabricationRelease).toBe(false);
  expect(result.manifest.computedStructuralApproval).toBe(false);
  expect(result.manifest.cuttingAvailable).toBe(true);
  expect(result.manifest.unlocatedPieceIds).toHaveLength(0);
  for (const r of result.manifest.overallDimensionReviews) expect(r.status, `cota geral ${r.axis}`).not.toBe("PENDENTE");
  // As 3 tesouras são iguais: um único tipo. Tesoura de 8 m sai em 1:25 na
  // folha inteira e a tabela de identificação vai para a folha seguinte.
  expect(new Set(result.manifest.pages.filter(v => v.title.startsWith("Tesoura — tipo")).map(v => v.title.replace(/ — (continuação|identificação de peças)$/, "")))).toEqual(new Set(["Tesoura — tipo 1 (3×)"]));

  const out = ".tools/complete-package/tom-8x10";
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/pacote.zip`, result.zip);
  for (const f of result.files) {
    const path = `${out}/${f.name}`;
    mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    writeFileSync(path, f.bytes);
  }
  const extras = tom8x10Extras();
  writeFileSync(`${out}/resumo-tom-8x10.json`, JSON.stringify({
    obra: OBRA, premissas: PREMISSAS, revisao: REV,
    pecas: pieces.length, massaKg: report.totals.massKg,
    barras: cut.groups.map(g => ({ perfil: g.profile, barras: g.bars.length, sobraMm: g.bars.reduce((s, b) => s + b.remainderMm, 0) })),
    custoAcoCentavos: result.manifest.commercialCostCombinedCents,
    telhas: extras, paginas: result.manifest.pages.map(s => s.title),
  }, null, 2));
}, 120000);
