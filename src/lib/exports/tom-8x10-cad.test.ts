/**
 * Obra nova do Tom (18/11/2026): cobertura de UMA ÁGUA, 8 m de largura por
 * 10 m de comprimento, 3 tesouras, 6 linhas de terças de 10 m, telha simples
 * TR40 0,50 mm, caída de 10 %, calha de 40 cm (não orçada), mão de obra
 * R$ 50/m². Pedido em paralelo ao Alan: comparar depois.
 *
 * Geometria declarada conforme o desenho do Tom (tesoura de 7,25 m, 7,5 a
 * 80 cm, painéis de 50 cm a partir do lado alto), exportada pelo motor CAD.
 * Premissas NÃO informadas pelo Tom estão em PREMISSAS e saem nas notas das pranchas. Estudo de conferência:
 * sem cargas, sem dimensionamento, todos os bloqueios mantidos.
 */
import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createQuickProject } from "@/domain/quick-project";
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
  // Desenho do Tom (18/11 06:52-06:53): do muro baixo, 15 cm de apoio da calha +
  // calha de 40 + 20 cm até a ponta da tesoura; tesoura com 7,5 cm na ponta e
  // 80 cm no lado alto, ancorada no muro; painel de 50 cm com diagonal de 94 cm.
  zonaCalhaMm: 750, // 150 + 400 + 200
  alturaTesouraBaixaMm: 75,
  alturaTesouraAltaMm: 800,
  painelMm: 500, // Tom: 50 cm a partir do lado alto (diagonal de 94 cm); sobra de 250 na ponta
  tercaPassoMm: 1500, // a partir do lado alto; a última terça na ponta (1,25 m)
  beiralCalhaMm: 300, // telha passa 20 cm da ponta e entra ~10 cm na calha
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
  telhaAvancoCalhaMm: 300, // além da ponta da tesoura: 20 cm + 10 cm dentro da calha
  precoBarraUe: 15500, precoBarraU: 13500, // centavos; orçamento do Alan nov/2026
} as const;
// U 100x40x2,65: massa publicada 3,54 kg/m (catálogo JPN P048) -> área equivalente a 7850 kg/m³.
const AREA_U100_CM2 = 3.54 / 7850 * 1e4;
// Cantoneira 7/8" x 1/8" (22,225 x 3,175 mm), área nominal sem raios (~1,03 kg/m).
const AREA_L78_CM2 = (2 * 22.225 - 3.175) * 3.175 / 100;
// Área pela linha média, sem raios de dobra (nominal). Fornecedor pode diferir ~2 %.
const AREA_UE75_CM2 = (75 - 2.65 + 2 * (40 - 2.65) + 2 * (15 - 1.325)) * 2.65 / 100;

const VAO_TESOURA_M = (OBRA.larguraM * 1000 - PREMISSAS.zonaCalhaMm) / 1000; // 7,25 m
export function buildTom8x10() {
  const p = createQuickProject({
    typology: "mono", widthM: VAO_TESOURA_M, lengthM: OBRA.comprimentoM,
    heightM: (PREMISSAS.zApoioMm + PREMISSAS.alturaTesouraBaixaMm) / 1000, slopePercent: OBRA.caidaPercent,
    name: "Tom - cobertura uma água 8 x 10 m - TR40", client: "Obra do Tom (cliente a informar)",
  });
  p.planning = null; // geometria declarada abaixo, conforme o desenho do Tom
  // X a partir do muro baixo; ponta da tesoura em X=750, lado alto em X=8000.
  // Montantes a cada 500 mm a partir do lado alto (Tom), sobra de 250 na ponta.
  const X0 = PREMISSAS.zonaCalhaMm, X1 = OBRA.larguraM * 1000, Z0 = PREMISSAS.zApoioMm;
  const topZ = (x: number) => Z0 + PREMISSAS.alturaTesouraBaixaMm + (x - X0) * OBRA.caidaPercent / 100;
  const stations: number[] = [];
  for (let x = X1; x > X0 + 1e-6; x -= PREMISSAS.painelMm) stations.unshift(x);
  stations.unshift(X0);
  type Node = { id: string; x: number; y: number; z: number };
  type Piece = { id: string; role: "topChord" | "bottomChord" | "web" | "purlin"; start: string; end: string; label: string; group: string };
  const nodes: Node[] = [], pieces: Piece[] = [], byKey = new Map<string, string>();
  const node = (x: number, y: number, z: number, id?: string) => {
    const key = [x, y, z].map(v => v.toFixed(3)).join("/");
    if (!id && byKey.has(key)) return byKey.get(key)!;
    const nid = id ?? `N${nodes.length + 1}`; nodes.push({ id: nid, x, y, z }); if (!id) byKey.set(key, nid); return nid;
  };
  const trussY = Array.from({ length: OBRA.tesouras }, (_, f) => f * OBRA.comprimentoM * 1000 / (OBRA.tesouras - 1));
  trussY.forEach((y, k) => {
    const f = k + 1, low = stations.map(x => node(x, y, Z0)), up = stations.map(x => node(x, y, topZ(x)));
    for (const [role, key, label, a, b] of [["bottomChord", "BI", "Banzo inferior", [X0, Z0], [X1, Z0]], ["topChord", "BS", "Banzo superior", [X0, topZ(X0)], [X1, topZ(X1)]]] as const) {
      // uma barra inteira a partir da ponta baixa + o restante (emenda fora do nó)
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = PREMISSAS.emendaBanzoMm / len;
      const e = node(a[0] + t * (b[0] - a[0]), y, a[1] + t * (b[1] - a[1]), `T${f}-${key}-EMENDA`);
      const s0 = key === "BI" ? low[0] : up[0], s1 = key === "BI" ? low.at(-1)! : up.at(-1)!;
      pieces.push({ id: `T${f}-${key}-A`, role, start: s0, end: e, label: `${label} ${PREMISSAS.perfilTesoura}`, group: "TESOURA" });
      pieces.push({ id: `T${f}-${key}-B`, role, start: e, end: s1, label: `${label} ${PREMISSAS.perfilTesoura}`, group: "TESOURA" });
    }
    stations.forEach((_, i) => pieces.push({ id: `T${f}-M${i + 1}`, role: "web", start: low[i], end: up[i], label: `Montante ${PREMISSAS.perfilAlma}`, group: "TESOURA" }));
    // Diagonal do topo do montante mais alto até a base do vizinho mais baixo (Tom: 94 cm no 1º painel).
    for (let i = 0; i + 1 < stations.length; i++)
      pieces.push({ id: `T${f}-D${i + 1}`, role: "web", start: low[i], end: up[i + 1], label: `Diagonal ${PREMISSAS.perfilAlma}`, group: "TESOURA" });
  });
  // Terças a cada 1,50 m a partir do lado alto; a última na ponta (todas em nós).
  const purlinX = [...new Set([...Array.from({ length: OBRA.linhasTercas - 1 }, (_, r) => X1 - r * PREMISSAS.tercaPassoMm), X0])].sort((u, v) => u - v);
  purlinX.forEach((x, r) => trussY.slice(0, -1).forEach((y, v) =>
    pieces.push({ id: `TE${r + 1}-V${v + 1}`, role: "purlin", start: node(x, y, topZ(x)), end: node(x, trussY[v + 1], topZ(x)), label: `Terça ${PREMISSAS.perfilTerca}`, group: "TERCAS" })));

  p.name = "Tom - cobertura uma água 8 x 10 m - TR40";
  p.technicalNotes = [
    "ESTUDO DE CONFERÊNCIA. Sem cargas, vento, dimensionamento ou ligações. Não usar para fabricação.",
    `Dados do Tom: ${SOURCE}.`,
    `Premissas JPN a confirmar: ${PREMISSAS.apoio}; Z=${PREMISSAS.zApoioMm} mm é referência de desenho;`,
    `desenho do Tom: muro baixo + 15 cm de apoio da calha + calha de 40 cm + 20 cm até a ponta da tesoura; tesoura de 7,25 m com ${PREMISSAS.alturaTesouraBaixaMm} mm na ponta e ${PREMISSAS.alturaTesouraAltaMm} mm no lado alto, ancorada no muro alto (detalhe da chapa a confirmar);`,
    `painéis de 50 cm a partir do lado alto (diagonal de 94 cm no primeiro) e 25 cm na ponta, ${PREMISSAS.diagonais}; terças a cada 1,50 m a partir do lado alto e na ponta;`,
    `apoio da ponta baixa e calha rebaixada não modelados no motor (sem elemento de calha): ver croqui do Tom;`,
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
  const x0 = PREMISSAS.zonaCalhaMm, top = (x: number) => PREMISSAS.zApoioMm + PREMISSAS.alturaTesouraBaixaMm + (x - x0) * OBRA.caidaPercent / 100;
  const W = OBRA.larguraM * 1000, L = OBRA.comprimentoM * 1000, xs = x0 - PREMISSAS.beiralCalhaMm;
  draft.physicalRoofFaces = physicalRoofFacesSchema.parse({
    schema_version: "jpn.physical-roof-faces/1", units: "mm", source: SOURCE, revision: REV,
    faces: [{ id: "AGUA", source: `${SOURCE} / face única`, revision: REV, supportPieceIds: [],
      outer: [[xs, 0, top(xs)], [W, 0, top(W)], [W, L, top(W)], [xs, L, top(xs)], [xs, 0, top(xs)]] as [number, number, number][], holes: [] }],
  });
  p.workspace.spatialPreparation = draft;
  p.workspace.overallDimensionChecks = [
    { axis: "x", statedLengthMm: W - xs, source: "Telha: 7,25 m de tesoura + 30 cm além da ponta (20 cm + 10 cm na calha)", revision: REV },
    { axis: "y", statedLengthMm: L, source: "Comprimento informado pelo Tom", revision: REV },
  ];
  return transferDeclaredTakeoff(p, 0);
}

/** Telhas, parafusos e mão de obra (fora do motor de aço). */
export function tom8x10Extras() {
  const slopeMm = Math.hypot(VAO_TESOURA_M * 1000, VAO_TESOURA_M * OBRA.caidaPercent * 10);
  const sheetLengthMm = Math.ceil((slopeMm + PREMISSAS.telhaAvancoCalhaMm * Math.hypot(1, OBRA.caidaPercent / 100)) / 10) * 10; // corte a cada 10 mm
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
  // por tesoura: 2 BI + 2 BS + 16 montantes + 15 diagonais
  expect(pieces.filter(q => q.role !== "purlin")).toHaveLength(OBRA.tesouras * (4 + 16 + 15));
  const area = inspectPhysicalRoofFaces(p.workspace.spatialPreparation!.physicalRoofFaces!).faces.reduce((s, f) => s + f.horizontalAreaM2, 0);
  expect(area).toBeCloseTo(75.5, 6); // telha: 7,55 x 10 m (a calha cobre o resto até o muro)
  // Terças nos nós: cada linha de terça coincide com um nó do banzo superior.
  const nodes = new Map(p.workspace.physicalStructure!.nodes.map(n => [n.id, n]));
  const purlinX = [...new Set(pieces.filter(q => q.role === "purlin").map(q => nodes.get(q.start)!.x))].sort((a, b) => a - b);
  expect(purlinX.map(x => Math.round(x))).toEqual([750, 2000, 3500, 5000, 6500, 8000]);
  const d1 = pieces.find(q => q.id === "T1-D15")!; // painel do lado alto
  expect(Math.round(Math.hypot(...(["x", "y", "z"] as const).map(k => nodes.get(d1.end)![k] - nodes.get(d1.start)![k])))).toBe(943);
  // Tesoura: 7,5 cm na ponta, 80 cm no lado alto (desenho do Tom).
  const webH = pieces.filter(q => /-M\d+$/.test(q.id)).map(q => Math.round(Math.abs(nodes.get(q.end)!.z - nodes.get(q.start)!.z)));
  expect(Math.min(...webH)).toBe(75); expect(Math.max(...webH)).toBe(800);
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
  // As 3 tesouras são iguais: um único tipo. Tesoura de 7,25 m sai em 1:25 na
  // folha inteira e a tabela de identificação vai para a folha seguinte.
  expect(new Set(result.manifest.pages.filter(v => v.title.startsWith("Tesoura — tipo")).map(v => v.title.replace(/( — (continuação|identificação de peças))+$/, "")))).toEqual(new Set(["Tesoura — tipo 1 (3×)"]));

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
