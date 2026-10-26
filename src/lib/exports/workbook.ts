import ExcelJS from "exceljs";
import type { Project, Settings } from "@/domain/models";
import { calculateCost, calculateEstimate } from "@/domain/calculations/estimate";

export async function createInternalWorkbook(project: Project, settings: Settings): Promise<ArrayBuffer> {
  const result = calculateEstimate(project);
  if (result.saleCents === null) throw new Error("Resolva as pendências de cálculo antes de baixar a planilha.");
  const book = new ExcelJS.Workbook(); book.creator = settings.companyName;
  const summary = book.addWorksheet("Resumo interno");
  summary.addRows([
    ["USO INTERNO — contém custos e lucro"], ["Empresa", settings.companyName], ["Obra", project.name], ["Cliente", project.client],
    ["Exemplo fictício", project.isExample ? "Sim" : "Não"],
    ["Materiais", result.materialsCents / 100], ["Mão de obra", result.laborCents / 100], ["Despesas", result.expensesCents / 100],
    ["Encargos sobre custos", result.costChargesCents / 100], ["Encargos sobre venda", result.saleChargesCents / 100],
    ["Custo total", result.totalCostCents / 100], ["Preço de venda", result.saleCents / 100], ["Lucro bruto", result.profitCents! / 100],
    ["Margem bruta", result.grossMarginPercent! / 100], ["Modo de preço", project.estimate.pricingMode], ["Percentual informado", project.estimate.pricingPercent! / 100],
    ["Conferência", "Valores calculados na exportação. Alterar células não recalcula o orçamento; faça ajustes no sistema."],
  ]);
  for (let row = 6; row <= 13; row++) summary.getCell(row, 2).numFmt = '"R$" #,##0.00';
  summary.getCell("B14").numFmt = "0.00%"; summary.getCell("B16").numFmt = "0.00%";
  summary.columns = [{ width: 34 }, { width: 75 }];
  const items = book.addWorksheet("Itens e custos");
  items.addRow(["Grupo", "Descrição", "Quantidade de compra", "Unidade", "Preço unitário (R$)", "Subtotal (R$)", "Perdas", "Origem", "Quantidade base", "Unidade de medição", "Medição por compra"]);
  project.estimate.materials.forEach((line, i) => items.addRow(["Material", line.name, result.materials[i].purchaseQuantity, line.purchaseUnit, line.unitPriceCents! / 100, result.materials[i].subtotalCents! / 100, line.wastePercent! / 100, line.source, result.materials[i].baseQuantity, line.measurementUnit, line.purchaseUnit === line.measurementUnit ? 1 : line.measurementPerPurchase]));
  for (const [key, label] of [["labor", "Mão de obra"], ["expenses", "Despesa"]] as const) project.estimate[key].forEach(line => items.addRow([label, line.description, line.quantity, line.unit, line.unitPriceCents! / 100, calculateCost(line)! / 100]));
  items.columns.forEach((column, i) => { column.width = i === 1 ? 55 : 23; });
  items.getColumn(5).numFmt = '"R$" #,##0.00'; items.getColumn(6).numFmt = '"R$" #,##0.00'; items.getColumn(7).numFmt = "0.00%";
  const charges = book.addWorksheet("Encargos"); charges.addRow(["Descrição", "Base de cálculo", "Percentual"]);
  project.estimate.charges.forEach(line => charges.addRow([line.description, line.basis === "cost" ? "Custo direto" : "Preço de venda", line.percent! / 100]));
  charges.columns = [{ width: 55 }, { width: 28 }, { width: 20 }]; charges.getColumn(3).numFmt = "0.00%";
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202C2C" } };
    sheet.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  }
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer).buffer;
}
