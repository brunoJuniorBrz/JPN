import { describe, expect, it } from "vitest";
import { exampleProject } from "../example";
import { newProject } from "../models";
import { emptyRoof } from "../project-details";
import { generateGeometry } from "./geometry";
import { calculateEstimate, calculateMaterial, multiplyCents } from "./estimate";
import { metersToMillimeters, millimetersToMeters, squareMillimetersToSquareMeters } from "./units";

describe("Geometria em uma única fonte de dados", () => {
  it("converte unidades sem misturar metros e milímetros", () => {
    expect(metersToMillimeters(6.5)).toBe(6500); expect(millimetersToMeters(350)).toBe(.35);
    expect(squareMillimetersToSquareMeters(60000000)).toBe(60);
  });
  it("calcula 6 x 10 m com inclinação de 10% e altura baixa de 3 m", () => {
    const model = generateGeometry(exampleProject().roof).model!;
    expect(model.metrics.projectedAreaM2).toBe(60); expect(model.metrics.riseM).toBeCloseTo(.6, 12);
    expect(model.metrics.slopeLengthM).toBeCloseTo(Math.sqrt(36.36), 12);
    expect(model.metrics.roofAreaM2).toBeCloseTo(60.2992537267, 9);
    expect(model.metrics.highHeightM).toBeCloseTo(3.6, 12);
    expect(model.views.plan.entities).toContainEqual({ type: "line", a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, layer: "COBERTURA" });
    expect(model.views.front.entities).toContainEqual({ type: "line", a: { x: 0, y: 3600 }, b: { x: 6000, y: 3000 }, layer: "COBERTURA" });
    expect(model.views.plan.entities.some(e => e.type === "text" && e.text === "Largura 6 m")).toBe(true);
    expect(model.views.plan.entities.filter(e => e.layer === "APOIOS")).toHaveLength(0);
  });
  it("inverte a queda sem alterar área e usa o comprimento quando solicitado", () => {
    const roof = exampleProject().roof;
    const reversed = generateGeometry({ ...roof, fall: "width-negative" }).model!;
    expect(reversed.metrics.roofAreaM2).toBe(generateGeometry(roof).model!.metrics.roofAreaM2);
    expect(reversed.views.front.entities).toContainEqual({ type: "line", a: { x: 0, y: 3000 }, b: { x: 6000, y: 3600 }, layer: "COBERTURA" });
    const along = generateGeometry({ ...roof, fall: "length-positive" }).model!;
    expect(along.metrics.riseM).toBe(1); expect(along.metrics.slopeLengthM).toBeCloseTo(Math.sqrt(101));
    expect(along.metrics.roofAreaM2).toBeCloseTo(reversed.metrics.roofAreaM2);
  });
  it("aceita inclinação zero, mas não inventa medidas ausentes ou inválidas", () => {
    expect(generateGeometry(emptyRoof()).model).toBeNull();
    expect(generateGeometry({ ...exampleProject().roof, widthM: -1 }).model).toBeNull();
    expect(generateGeometry({ ...exampleProject().roof, widthM: NaN }).model).toBeNull();
    const result = generateGeometry({ ...exampleProject().roof, slopePercent: 0 }).model!;
    expect(result.metrics.roofAreaM2).toBe(60); expect(result.warnings.join(" ")).toContain("Inclinação zero");
  });
  it("desenha apenas apoios válidos e sinaliza duplicados e posições fora da cobertura", () => {
    const roof = { ...exampleProject().roof, supports: [{ id: crypto.randomUUID(), xM: 0, yM: 0 }, { id: crypto.randomUUID(), xM: 6, yM: 10 }] };
    const model = generateGeometry(roof).model!; expect(model.validSupportCount).toBe(2);
    for (const view of Object.values(model.views)) expect(view.entities.filter(e => e.type === "circle")).toHaveLength(2);
    const bad = generateGeometry({ ...roof, supports: [...roof.supports, { id: crypto.randomUUID(), xM: 7, yM: 0 }, { id: crypto.randomUUID(), xM: 0, yM: 0 }] }).model!;
    expect(bad.validSupportCount).toBe(2); expect(bad.warnings.join(" ")).toMatch(/fora da cobertura/); expect(bad.warnings.join(" ")).toMatch(/mesma posição/);
  });
});
describe("Quantitativos e arredondamento de compras", () => {
  it("aplica perdas à área real e calcula subtotal em centavos", () => {
    const project = exampleProject(), row = calculateMaterial(project.estimate.materials[0], generateGeometry(project.roof));
    expect(row.pending).toEqual([]); expect(row.purchaseQuantity).toBe(63.315); expect(row.subtotalCents).toBe(506520);
  });
  it("converte 24 metros em quatro barras de seis metros e arredonda uma sobra para cima", () => {
    const p = exampleProject(), line = p.estimate.materials[1], g = generateGeometry(p.roof);
    expect(calculateMaterial(line, g).purchaseQuantity).toBe(4);
    expect(calculateMaterial({ ...line, wastePercent: 1 }, g).purchaseQuantity).toBe(5);
    expect(calculateMaterial({ ...line, measurementPerPurchase: null }, g).subtotalCents).toBeNull();
  });
  it("mantém pendentes preço, quantidade, perdas, geometria e unidade incompatível", () => {
    const p = exampleProject(), line = p.estimate.materials[0], g = generateGeometry(p.roof);
    expect(calculateMaterial({ ...line, unitPriceCents: null }, g).subtotalCents).toBeNull();
    expect(calculateMaterial({ ...line, source: "manual", manualQuantity: null }, g).subtotalCents).toBeNull();
    expect(calculateMaterial({ ...line, wastePercent: null }, g).subtotalCents).toBeNull();
    expect(calculateMaterial(line, generateGeometry(emptyRoof())).subtotalCents).toBeNull();
    expect(calculateMaterial({ ...line, measurementUnit: "un" }, g).subtotalCents).toBeNull();
  });
  it("não inventa número de apoios", () => {
    const p = exampleProject(); p.estimate.materials[2].source = "support-count";
    expect(calculateEstimate(p).saleCents).toBeNull();
    p.roof.supports = [{ id: crypto.randomUUID(), xM: 0, yM: 0 }];
    expect(calculateEstimate(p).materials[2].purchaseQuantity).toBe(1);
  });
});
describe("Orçamento em centavos", () => {
  it("soma o exemplo sem duplicar custos", () => {
    const r = calculateEstimate(exampleProject());
    expect(r.pending).toEqual([]); expect(r.materialsCents).toBe(631520);
    expect(r.laborCents).toBe(120000); expect(r.expensesCents).toBe(35000);
    expect(r.totalCostCents).toBe(786520); expect(r.saleCents).toBe(983150);
    expect(r.profitCents).toBe(196630); expect(r.grossMarginPercent).toBe(20);
  });
  function basic() { const p = newProject(); p.estimate.expenses = [{ id: crypto.randomUUID(), description: "Custo", quantity: 1, unit: "un", unitPriceCents: 100000 }]; p.estimate.pricingPercent = 25; return p; }
  it("distingue markup e margem sobre venda", () => {
    const p = basic(); expect(calculateEstimate(p).saleCents).toBe(125000);
    p.estimate.pricingMode = "margin"; expect(calculateEstimate(p).saleCents).toBe(133333);
    p.estimate.pricingPercent = 100; expect(calculateEstimate(p).saleCents).toBeNull();
    p.estimate.pricingPercent = null; expect(calculateEstimate(p).saleCents).toBeNull();
  });
  it("arredonda metade para cima e não perde centavos em multiplicações decimais", () => {
    expect(multiplyCents(10, 3)).toBe(30); expect(multiplyCents(1001, .5)).toBe(501); expect(multiplyCents(333, 1.5)).toBe(500);
  });
  it("incorpora encargos nas bases escolhidas e preserva a margem", () => {
    const p = basic(); p.estimate.charges = [{ id: crypto.randomUUID(), description: "Encargo custo", basis: "cost", percent: 10 }, { id: crypto.randomUUID(), description: "Encargo venda", basis: "sale", percent: 5 }];
    p.estimate.pricingMode = "margin"; const r = calculateEstimate(p);
    expect(r.costChargesCents).toBe(10000); expect(r.saleCents).toBe(157143);
    expect(r.saleChargesCents).toBe(7857); expect(r.totalCostCents).toBe(117857); expect(r.profitCents).toBe(39286);
    expect(r.grossMarginPercent).toBeCloseTo(25, 2);
    p.estimate.pricingMode = "markup"; const m = calculateEstimate(p); expect(m.profitCents! / m.totalCostCents).toBeCloseTo(.25, 4);
  });
  it("bloqueia combinações inviáveis e itens incompletos", () => {
    const p = basic(); p.estimate.charges = [{ id: crypto.randomUUID(), description: "Encargo", basis: "sale", percent: 90 }];
    expect(calculateEstimate(p).saleCents).toBeNull();
    p.estimate.charges = []; p.estimate.expenses[0].quantity = null; expect(calculateEstimate(p).saleCents).toBeNull();
    expect(calculateEstimate(newProject()).saleCents).toBeNull();
  });
  it("recalcula desenho, área e custo a partir da mesma largura", () => {
    const p = exampleProject(), before = calculateEstimate(p); p.roof.widthM = 8;
    const geometry = generateGeometry(p.roof).model!, after = calculateEstimate(p);
    expect(after.materials[0].baseQuantity).toBe(geometry.metrics.roofAreaM2);
    expect(after.saleCents!).toBeGreaterThan(before.saleCents!);
    expect(geometry.views.plan.entities.some(e => e.type === "text" && e.text === "Largura 8 m")).toBe(true);
  });
  it("não usa o gerador de cobertura para categorias futuras", () => {
    const p = exampleProject(); p.category = "Mezanino"; expect(calculateEstimate(p).saleCents).toBeNull();
    p.estimate.materials[0].source = "manual"; p.estimate.materials[0].manualQuantity = 50;
    expect(calculateEstimate(p).saleCents).not.toBeNull();
  });
});
