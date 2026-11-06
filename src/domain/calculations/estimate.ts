import type { Project } from "../models";
import type { CostLine, MaterialLine } from "../project-details";
import { generateGeometry, type GeometryResult } from "./geometry";
import { takeoffSignature } from "./project-basis";
import { generateStructure } from "./structure";
import { guidedSupportIssue } from "../guided-support";

const SCALE = 1000000n, RATE = 10000n;
const scaled = (value: number) => BigInt(Math.round(value * Number(SCALE)));
const bps = (percent: number) => BigInt(Math.round(percent * 100));
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const roundDiv = (n: bigint, d: bigint) => (n + d / 2n) / d;
function safe(n: bigint): number { if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Os valores ultrapassam o limite seguro de cálculo. Reduza as quantidades ou divida o orçamento."); return Number(n); }
export function moneyLabel(cents: number): string { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
export function multiplyCents(cents: number, quantity: number): number { return safe(roundDiv(BigInt(cents) * scaled(quantity), SCALE)); }
export interface MaterialResult { id: string; baseQuantity: number | null; purchaseQuantity: number | null; subtotalCents: number | null; pending: string[]; }
export function calculateMaterial(line: MaterialLine, geometry: GeometryResult): MaterialResult {
  const result: MaterialResult = { id: line.id, baseQuantity: null, purchaseQuantity: null, subtotalCents: null, pending: [] };
  let amount: number | null = line.manualQuantity;
  if (line.source !== "manual" && line.source !== "takeoff") {
    const expectedUnit = line.source === "roof-area" ? "m²" : line.source === "slope-length" ? "m" : "un";
    if (line.measurementUnit !== expectedUnit) result.pending.push(`Esta regra exige medição em ${expectedUnit}.`);
    if (!geometry.model) result.pending.push("Preencha as medidas da cobertura.");
    if (line.source === "support-count" && (!geometry.model?.validSupportCount || geometry.model.warnings.some(w => w.includes("apoios") || w.includes("Apoios")))) result.pending.push("Informe e confira a posição de todos os apoios.");
    amount = !geometry.model ? null : line.source === "roof-area" ? geometry.model.metrics.roofAreaM2 : line.source === "slope-length" ? geometry.model.metrics.slopeLengthM : geometry.model.validSupportCount;
  }
  result.baseQuantity = amount;
  if (amount === null) result.pending.push("Informe a quantidade.");
  const conversion = line.purchaseUnit === line.measurementUnit ? 1 : line.measurementPerPurchase;
  if (conversion === null) result.pending.push(`Informe quantos ${line.measurementUnit} existem em cada ${line.purchaseUnit}.`);
  if (line.unitPriceCents === null) result.pending.push("Informe o preço de compra.");
  if (line.wastePercent === null) result.pending.push("Informe o percentual de perdas (zero se não houver).");
  if (amount !== null && conversion !== null && result.pending.every(p => p === "Informe o preço de compra.")) {
    // Compras discretas sobem para inteiro; m, m² e kg sobem para 0,001.
    const quantum = line.purchaseUnit === "un" || line.purchaseUnit === "barra" ? SCALE : 1000n;
    const finalScaled = ceilDiv(scaled(amount) * (RATE + bps(line.wastePercent ?? 0)) * SCALE, RATE * scaled(conversion) * quantum) * quantum;
    result.purchaseQuantity = safe(finalScaled) / Number(SCALE);
    if (line.unitPriceCents !== null) result.subtotalCents = safe(roundDiv(BigInt(line.unitPriceCents) * finalScaled, SCALE));
  }
  return result;
}
export function calculateCost(line: CostLine): number | null {
  return !line.description.trim() || !line.unit.trim() || line.quantity === null || line.unitPriceCents === null ? null : multiplyCents(line.unitPriceCents, line.quantity);
}
export interface EstimateResult {
  materials: MaterialResult[]; materialsCents: number; laborCents: number; expensesCents: number;
  directCostCents: number; costChargesCents: number; saleChargesCents: number;
  totalCostCents: number; saleCents: number | null; profitCents: number | null; grossMarginPercent: number | null;
  pending: string[]; warnings: string[];
}
export function calculateEstimate(project: Project): EstimateResult {
  const result: EstimateResult = { materials: [], materialsCents: 0, laborCents: 0, expensesCents: 0, directCostCents: 0, costChargesCents: 0, saleChargesCents: 0, totalCostCents: 0, saleCents: null, profitCents: null, grossMarginPercent: null, pending: [], warnings: [] };
  const e = project.estimate;
  if (e.materials.some(line => line.source === "takeoff" && line.quantityOrigin?.signature !== takeoffSignature(project))) result.pending.push("Levantamento alterado: atualize os quantitativos vinculados antes de emitir o orçamento.");
  const geometry: GeometryResult = !project.workspace.physicalStructure&&project.category === "Cobertura metálica"&&!guidedSupportIssue(project) ? generateGeometry(project.roof, project.planning?.typology) : { model: null, pending: ["Área/contorno e caminho físico não declarados; não se utiliza o retângulo envolvente."] };
  if (geometry.model && project.planning) {
    const structure = generateStructure(project).model;
    if (structure) { geometry.model.metrics.roofAreaM2 = structure.roofAreaM2; geometry.model.metrics.projectedAreaM2 = structure.projectedAreaM2; }
  }
  try {
    result.materials = e.materials.map(line => calculateMaterial(line, geometry));
    result.materials.forEach((row, i) => row.pending.forEach(p => result.pending.push(`${e.materials[i].name}: ${p}`)));
    result.materialsCents = safe(result.materials.reduce((sum, row) => sum + BigInt(row.subtotalCents ?? 0), 0n));
    for (const [key, label] of [["labor", "Mão de obra"], ["expenses", "Despesas"]] as const) {
      const rows = e[key].map(calculateCost);
      rows.forEach((value, i) => { if (value === null) result.pending.push(`${label}, item ${i + 1}: informe descrição, quantidade, unidade e preço.`); });
      result[key === "labor" ? "laborCents" : "expensesCents"] = safe(rows.reduce<bigint>((sum, n) => sum + BigInt(n ?? 0), 0n));
    }
    if (!e.materials.length && !e.labor.length && !e.expenses.length) result.pending.push("Adicione materiais, mão de obra ou despesas para calcular o orçamento.");
    if (!e.materials.length) result.warnings.push("Nenhum material foi incluído.");
    if (!e.labor.length) result.warnings.push("Mão de obra não informada.");
    if (!e.expenses.length) result.warnings.push("Despesas não informadas.");
    if (e.materials.some(m => m.source === "roof-area")) result.warnings.push("Área em m² não define o número de telhas. Peças e sobreposições dependem do fabricante.");
    result.directCostCents = safe(BigInt(result.materialsCents) + BigInt(result.laborCents) + BigInt(result.expensesCents));
    for (const charge of e.charges) {
      if (!charge.description.trim() || charge.percent === null) result.pending.push("Complete a descrição e o percentual de cada encargo.");
      else if (charge.basis === "cost") result.costChargesCents += safe(roundDiv(BigInt(result.directCostCents) * bps(charge.percent), RATE));
    }
    const cost = BigInt(result.directCostCents) + BigInt(result.costChargesCents);
    result.totalCostCents = safe(cost);
    const rate = e.pricingPercent;
    if (rate === null || (e.pricingMode === "margin" && rate >= 100)) result.pending.push("Informe um percentual válido. A margem sobre venda deve ser menor que 100%.");
    if (result.pending.length || rate === null) return result;
    const saleRate = e.charges.filter(c => c.basis === "sale").reduce((sum, c) => sum + bps(c.percent ?? 0), 0n);
    const pricing = bps(rate);
    // C = custo base + taxas sobre venda. Markup: P = C(1+m). Margem: P = C/(1-m).
    const denominator = e.pricingMode === "markup" ? RATE * RATE - saleRate * (RATE + pricing) : RATE - pricing - saleRate;
    if (denominator <= 0n) { result.pending.push("Essa combinação de ganho e encargos não permite calcular um preço. Reduza os percentuais."); return result; }
    const numerator = e.pricingMode === "markup" ? cost * (RATE + pricing) * RATE : cost * RATE;
    result.saleCents = safe(roundDiv(numerator, denominator));
    result.saleChargesCents = safe(e.charges.filter(c => c.basis === "sale").reduce((sum, c) => sum + roundDiv(BigInt(result.saleCents!) * bps(c.percent ?? 0), RATE), 0n));
    result.totalCostCents = safe(cost + BigInt(result.saleChargesCents));
    result.profitCents = result.saleCents - result.totalCostCents;
    result.grossMarginPercent = result.saleCents ? result.profitCents / result.saleCents * 100 : 0;
    return result;
  } catch (error) {
    result.saleCents = null; result.profitCents = null; result.grossMarginPercent = null;
    result.pending.push(error instanceof Error ? error.message : "Não foi possível calcular estes valores."); return result;
  }
}
