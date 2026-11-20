/**
 * Preparação do cálculo para a obra montada no editor de tesoura.
 *
 * O editor CONHECE a obra por construção (gerou cada nó e cada barra), então declara
 * aqui o que antes ficava pendente para preenchimento manual:
 *  - aço: E = 200 GPa, G = 77 GPa, ν = 0,3 (NBR 8800:2024 4.5.2.9; valem para todo aço estrutural);
 *  - inércias dos perfis pela linha média da seção (cantos vivos), a partir da designação;
 *  - tesoura SOLDADA: banzos, montantes, diagonais e pilares como pórtico com nós rígidos (com
 *    montantes articulados o plano do telhado fica sem amarração lateral — mecanismo — porque o
 *    editor não modela contraventamento); terças biapoiadas (articuladas à flexão, torção contida);
 *  - conectividade: todos os encontros gerados pelo editor são ligados (topologia por construção);
 *  - ações: peso próprio do aço (automático), telha (NBR 6120:2019 Tabela 5) e sobrecarga de
 *    cobertura (NBR 6120:2019 6.4), levadas às terças por faixa de influência (beiral incluso);
 *  - combinações NBR 8681:2025 pelo gerador existente: ELU normais + ELS rara (cabem no limite de
 *    saída do motor; quase-permanente/frequente ficam para quando houver critério de serviço).
 *
 * NÃO declara vento na cobertura: os coeficientes das Tabelas 7/8 da NBR 6123 só entram por
 * extrato privado do responsável. Fica como pendência explícita (TRUSS_WIND_PENDING).
 * Nada aqui aprova a estrutura: computedStructuralApproval=false, fabricationRelease=false,
 * releaseGate NOT_READY_BLOCKED continuam valendo.
 */
import type { Project } from "./models";
import nbr6120 from "../../data/normas/nbr6120-2019-actions.json" with { type: "json" };
import { applyNbr8681Combinations } from "./nbr8681-combinations";
import { roofVariableLoad } from "./nbr6120-actions";
import { selfWeightOverlapReviewBasis } from "./structural-loading";
import { inspectConnectivity } from "./spatial-connectivity";
import { resolvePhysicalStructure } from "./physical-structure";
import { structureSignature } from "./calculations/project-basis";
import { spatialPreparationSchema } from "./spatial-preparation";
import type { TrussEditor } from "./truss-editor";

/** Itens de telha da NBR 6120:2019 Tabela 5 disponíveis no repositório. */
export const CLADDING_ITEMS = nbr6120.permanent.table5Telhas.items as Record<string, { label: string; knM2: number }>;
export const STEEL_E_GPA = 200, STEEL_G_GPA = 77, STEEL_NU = 0.3;
export const TRUSS_ANALYSIS_CASES = { selfWeight: "PP", cladding: "TELHA", live: "SC" } as const;

export type SectionGeometry = { iyCm4: number; izCm4: number; jCm4: number; areaCm2: number; method: string };
const INCH = 25.4;
const frac = (s: string) => s.split(" ").reduce((sum, part) => {
  const [a, b] = part.split("/").map(Number);
  return sum + (b ? a / b : a);
}, 0);

/** Propriedades pela LINHA MÉDIA (cantos vivos, sem raio de dobra). Iy = eixo FORTE com a alma vertical
 * (convenção jpn-z-up/1 com giro 0: Iy resiste a cargas no plano vertical da barra). Retorna null quando a
 * designação não é reconhecida: o cálculo fica pendente para esse perfil, nunca chutado. */
export function sectionGeometry(designation: string): SectionGeometry | null {
  const d = designation.replace(/,/g, ".").trim();
  const nums = (s: string) => s.split(/x/i).map(v => Number(v.trim()));
  const out = (iy: number, iz: number, j: number, a: number, kind: string): SectionGeometry =>
    ({ iyCm4: iy / 1e4, izCm4: iz / 1e4, jCm4: j / 1e4, areaCm2: a / 100, method: `${kind}: linha média, cantos vivos (sem raio de dobra)` });
  let m = /^Ue\s+([\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+)\s*(mm)?$/i.exec(d);
  if (m) {
    const [h, b, c, t] = nums(m[1]);
    if (![h, b, c, t].every(v => v > 0) || 2 * t >= Math.min(h, b) || t >= c) return null;
    const hw = h - t, bf = b - t, dl = c - t / 2, a = t * (hw + 2 * bf + 2 * dl);
    const iy = t * hw ** 3 / 12 + 2 * bf * t * (hw / 2) ** 2 + 2 * (t * dl ** 3 / 12 + dl * t * (hw / 2 - dl / 2) ** 2);
    const xc = (2 * bf * t * bf / 2 + 2 * dl * t * bf) / a;
    const iz = hw * t * xc ** 2 + 2 * (t * bf ** 3 / 12 + bf * t * (bf / 2 - xc) ** 2) + 2 * dl * t * (bf - xc) ** 2;
    return out(iy, iz, t ** 3 / 3 * (hw + 2 * bf + 2 * dl), a, "Ue");
  }
  m = /^U\s+([\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+)\s*(mm)?$/i.exec(d);
  if (m) {
    const [h, b, t] = nums(m[1]);
    if (![h, b, t].every(v => v > 0) || 2 * t >= Math.min(h, b)) return null;
    const hw = h - t, bf = b - t / 2, a = t * (hw + 2 * bf);
    const iy = t * hw ** 3 / 12 + 2 * bf * t * (hw / 2) ** 2;
    const xc = bf * bf * t / a;
    const iz = hw * t * xc ** 2 + 2 * (t * bf ** 3 / 12 + bf * t * (bf / 2 - xc) ** 2);
    return out(iy, iz, t ** 3 / 3 * (hw + 2 * bf), a, "U");
  }
  m = /^Tubo\s+([\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+)\s*(mm)?$/i.exec(d);
  if (m) {
    const [b, h, t] = nums(m[1]);
    if (![b, h, t].every(v => v > 0) || 2 * t >= Math.min(b, h)) return null;
    const bi = b - 2 * t, hi = h - 2 * t, a = b * h - bi * hi;
    const iy = (b * h ** 3 - bi * hi ** 3) / 12, iz = (h * b ** 3 - hi * bi ** 3) / 12;
    const bm = b - t, hm = h - t, j = 2 * t * bm * bm * hm * hm / (bm + hm);   // Bredt, seção fechada
    return out(iy, iz, j, a, "Tubo retangular");
  }
  m = /^L\s+([\d/ ]+?)\s*x\s*([\d/ ]+?)\s*pol$/i.exec(d);
  if (m) {
    const a = frac(m[1].trim()) * INCH, t = frac(m[2].trim()) * INCH;
    if (!(a > 0 && t > 0 && 2 * t < a)) return null;
    const area = t * (2 * a - t), c = (a * a + a * t - t * t) / (2 * (2 * a - t));
    const i = (t * (a - c) ** 3 + a * c ** 3 - (a - t) * (c - t) ** 3) / 3;      // eixos geométricos (abas iguais)
    return out(i, i, t ** 3 / 3 * (2 * a - t), area, "Cantoneira de abas iguais (eixos geométricos)");
  }
  return null;
}

/** Faixa de influência HORIZONTAL (mm) de cada linha de terça, incluindo o beiral além da ponta.
 * Chave: coordenada x absoluta da terça (mesma usada no modelo físico). */
export function purlinTributaryMm(t: TrussEditor, x0: number, L: number, S: 1 | 2, xs: number, xe: number, purlinXs: number[]) {
  const faces = S === 1 ? [[xs, xe]] : [[xs, x0 + L], [x0 + L, xe]];
  const width = new Map<number, number>();
  for (const [a, b] of faces) {
    const inside = [...new Set(purlinXs.filter(x => x >= a - 1e-6 && x <= b + 1e-6))].sort((p, q) => p - q);
    inside.forEach((x, i) => {
      const lo = i === 0 ? a : (inside[i - 1] + x) / 2, hi = i === inside.length - 1 ? b : (x + inside[i + 1]) / 2;
      width.set(x, (width.get(x) ?? 0) + Math.max(0, hi - lo));
    });
  }
  return width;
}

export type TrussAnalysisPending = { code: string; message: string };

/** Completa a preparação do cálculo do projeto recém-montado pelo editor. */
export function prepareTrussAnalysis(project: Project, t: TrussEditor, geometry: {
  x0: number; L: number; S: 1 | 2; xs: number; xe: number; risePerRun: number; slopePercent: number;
}, revision: string): { project: Project; pending: TrussAnalysisPending[] } {
  const pending: TrussAnalysisPending[] = [];
  const next: Project = structuredClone(project);
  const d = next.workspace.spatialPreparation!, catalog = d.physicalCatalog!;
  const model = resolvePhysicalStructure(next).model!;
  const srcRev = `Editor de tesoura JPN ${revision}`;

  // 1. Aço e seções.
  catalog.materials = catalog.materials.map(mat => ({ ...mat, eGpa: STEEL_E_GPA, gGpa: STEEL_G_GPA, nu: STEEL_NU,
    materialSource: "Aço estrutural: E = 200 GPa, G = 77 GPa, ν = 0,3 (ABNT NBR 8800:2024 4.5.2.9); grau do aço não informado" }));
  catalog.sections = catalog.sections.map(s => {
    const g = s.designation ? sectionGeometry(s.designation) : null;
    if (!g) { pending.push({ code: "TRUSS_SECTION_UNKNOWN", message: `${s.designation ?? s.id}: designação não reconhecida; informe Iy, Iz e J na preparação.` }); return s; }
    return { ...s, iyCm4: Number(g.iyCm4.toFixed(4)), izCm4: Number(g.izCm4.toFixed(4)), jCm4: Number(g.jCm4.toFixed(5)),
      sectionSource: `${s.sectionSource}; inércias por ${g.method}` };
  });
  catalog.assignments = catalog.assignments.map(a => ({ ...a, rotationDeg: 0 }));

  // 2. Tipo de cada peça e ligações (hipóteses do modelo de treliça usual).
  d.memberKinds = model.pieces.map(p => ({ pieceId: p.id, kind: "frame" as const }));
  d.memberConnections = model.pieces.map(p => p.role === "purlin" ? { pieceId: p.id, start: "bending-pinned" as const, end: "bending-pinned" as const }
    : { pieceId: p.id, start: "rigid" as const, end: "rigid" as const });

  // 3. Conectividade: a topologia é do próprio gerador.
  const signature = structureSignature(next);
  d.geometrySignature = signature;
  d.connectivity = { version: 1, geometrySignature: signature,
    reviewSource: "Topologia gerada pelo editor de tesoura JPN: todos os encontros de barras foram criados ligados",
    junctions: inspectConnectivity(model).junctions.map(j => ({ nodeId: j.nodeId, pieceIds: j.pieceIds, decision: "connect" as const })) };

  // 4. Ações: peso próprio, telha e sobrecarga nas terças por faixa de influência.
  const cladding = CLADDING_ITEMS[t.sheet.cladding];
  const live = roofVariableLoad(geometry.slopePercent);
  const surfacePerPlan = Math.hypot(1, geometry.risePerRun);
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  const purlins = model.pieces.filter(p => p.role === "purlin");
  const purlinX = (id: string) => nodes.get(model.pieces.find(p => p.id === id)!.start)!.x;
  const width = purlinTributaryMm(t, geometry.x0, geometry.L, geometry.S, geometry.xs, geometry.xe, purlins.map(p => purlinX(p.id)));
  const { selfWeight: PP, cladding: TELHA, live: SC } = TRUSS_ANALYSIS_CASES;
  const uniform = purlins.flatMap((p, i) => {
    const trib = (width.get(purlinX(p.id)) ?? 0) / 1000;
    return [
      { id: `TELHA-${i + 1}`, pieceId: p.id, caseId: TELHA, coordinates: "global" as const,
        knM: [0, 0, -Number((cladding.knM2 * surfacePerPlan * trib).toFixed(6))] as [number, number, number],
        source: `NBR 6120:2019 Tabela 5, ${cladding.label} (${cladding.knM2} kN/m² na superfície) × faixa de ${trib.toFixed(3)} m em planta`, revision: srcRev },
      { id: `SC-${i + 1}`, pieceId: p.id, caseId: SC, coordinates: "global" as const,
        knM: [0, 0, -Number((live.qKnM2 * trib).toFixed(6))] as [number, number, number],
        source: `NBR 6120:2019 ${live.clause}: ${live.qKnM2} kN/m² em projeção horizontal × faixa de ${trib.toFixed(3)} m`, revision: srcRev },
    ];
  });
  if (uniform.length > 320) {
    pending.push({ code: "TRUSS_LOADS_LIMIT", message: "Obra com terças demais para o limite de cargas distribuídas (320); declare as ações na preparação." });
    next.workspace.spatialPreparation = spatialPreparationSchema.parse(d);
    return { project: next, pending };
  }
  d.cases = [
    { id: PP, source: "Peso próprio do aço (massa 7850 kg/m³ × g), automático por barra" },
    { id: TELHA, source: `Telha: ${cladding.label}, NBR 6120:2019 Tabela 5` },
    { id: SC, source: `Sobrecarga de cobertura NBR 6120:2019 6.4 (${live.basis})` },
  ];
  d.loads = [];
  d.loading = { version: 1, selfWeight: { caseId: PP, gravity: [0, 0, -9.80665], axialLumping: "half-to-end-nodes" }, uniform, roofArea: [] };
  d.connectionsReview = "Gerado pelo editor (conferir): tesoura soldada — banzos, montantes, diagonais e pilares com nós rígidos; terças biapoiadas sobre as tesouras. Sem contraventamento de cobertura modelado.";
  d.lateralSystem = t.support === "columns" || t.lineSupports.some(l => l.left === "column" || l.right === "column")
    ? `Gerado pelo editor (conferir): estabilidade pelos apoios declarados; base do pilar ${t.supportModel.columnBase === "fixed" ? "engastada" : "articulada (exige contraventamento não modelado)"}, terças ligando as tesouras.`
    : "Gerado pelo editor (conferir): tesouras sobre muros com translações e torção contidas pela chapa; terças ligando as tesouras.";
  d.loadPathReview = "Gerado pelo editor (conferir): telha simplesmente apoiada nas terças (faixa de influência, beiral na terça da ponta) -> terças -> tesouras -> muros/pilares.";
  next.workspace.spatialPreparation = spatialPreparationSchema.parse(d);

  // 5. Combinações NBR 8681:2025 pelo gerador já validado.
  const combined = applyNbr8681Combinations(next, {
    schema_version: "jpn.nbr8681-declaration/1", permanentMode: "separate", variableMode: "separate", permanentSets: ["unfavorable"],
    families: ["uls-normal", "sls-rare"],
    actions: [
      { nature: "permanent", caseId: PP, permanentType: "steel-and-equipment" },
      { nature: "permanent", caseId: TELHA, permanentType: "prefab-wood-industrialized" },
      { nature: "variable", caseId: SC, variableType: "other-and-equipment-temperature", psiRow: nbr6120.psiRowFor8681.row, exclusiveGroup: null },
    ],
  }).project;
  // Peso próprio automático + cargas nas terças: ações físicas distintas por construção (não há dupla contagem).
  const cd = combined.workspace.spatialPreparation!, loading = cd.loading!;
  loading.overlapReview = { confirmed: true, source: "Editor de tesoura JPN: peso próprio do aço e cargas de telha/sobrecarga nas terças são ações distintas",
    revision: srcRev, basis: selfWeightOverlapReviewBasis(cd, loading) };
  combined.workspace.spatialPreparation = spatialPreparationSchema.parse(cd);

  pending.push({ code: "TRUSS_WIND_PENDING", message: "Vento na cobertura (NBR 6123 Tabelas 7/8) não incluído: exige o extrato da norma transcrito pelo responsável. Sem vento, o cálculo não cobre sucção nem arrancamento." });
  return { project: combined, pending };
}
