import type { Project, Settings } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { roleLabels } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";

export function takeoffData(project: Project, settings: Settings) {
  const result = generateStructure(project);
  if (!result.model) throw new Error("Complete as medidas e a configuração para gerar as peças.");
  return { project, company: settings.companyName, businessInfo: settings.businessInfo, result: { ...result, model: result.model },
    issued: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) };
}
export type TakeoffData = ReturnType<typeof takeoffData>;

export async function createTakeoffPdf(data: TakeoffData): Promise<ArrayBuffer> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const { model, pending, notes } = data.result;
  doc.setProperties({ title: `Levantamento para cotação - ${data.project.name}`, author: data.company });
  autoTable(doc, { margin: { top: 26, bottom: 17 }, startY: 26, theme: "plain", styles: { fontSize: 10, cellPadding: 2 }, body: [
    ["Empresa", `${data.company}\n${data.businessInfo}`], ["Obra / cliente", `${data.project.name} / ${data.project.client}\n${data.project.location}`],
    ["Distribuição", `${model.frameCount} linhas de tesouras; vãos de ${formatMeasure(model.frameSpacingM)} m; ${model.purlinRows} linhas de terças, espaçadas em ${formatMeasure(model.purlinSpacingM)} m na água.`],
    ["Telhamento", `${formatMeasure(model.roofAreaM2)} m² de área geométrica. Quantidade de telhas comerciais pendente.`],
    ["Totais", `${model.pieces.length} peças; ${formatMeasure(model.totalLengthM)} m; massa ${model.massComplete ? "total" : "conhecida (parcial)"}: ${formatMeasure(model.knownMassKg)} kg.`],
    ["Hipóteses informadas", data.project.planning?.specificationNotes || "Sem observações adicionais."],
  ] });
  doc.addPage();
  autoTable(doc, { margin: { top: 26, bottom: 17 }, startY: 26, head: [["Tipo", "Perfil / aço", "Peças", "Compr. geom. (m)", "Total (m)", "Massa (kg)", "Identificação"]],
    body: model.groups.map(g => [roleLabels[g.role], `${g.profile.name || "A definir"}\n${g.profile.steelGrade || "Aço a definir"}`, g.pieceIds.length, formatMeasure(g.lengthMm / 1000, 6), formatMeasure(g.totalLengthM, 6), g.massKg === null ? "Pendente" : formatMeasure(g.massKg), g.pieceIds.join(", ")]),
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" }, headStyles: { fillColor: [36, 40, 35] }, columnStyles: { 6: { cellWidth: 65 } },
  });
  doc.addPage();
  autoTable(doc, { margin: { top: 26, bottom: 17 }, startY: 26, theme: "striped", head: [["Conferência final e limites do levantamento"]], body: [...pending, ...notes].map(n => [n]), styles: { fontSize: 10 }, headStyles: { fillColor: [36, 40, 35] } });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setTextColor(36, 40, 35); doc.setFontSize(15);
    doc.text("LEVANTAMENTO PARA COTAÇÃO", 14, 15); doc.setFontSize(9);
    doc.text(`${data.project.isExample ? "EXEMPLO FICTÍCIO · " : ""}PRELIMINAR · ${data.issued} · ${data.project.id.slice(0, 8)}`, 14, 21);
    doc.text("Quantidades geométricas. Conferir perfis e fabricação. Dimensionamento resistente ainda não implementado.", 14, 202);
    doc.text(`${page}/${doc.getNumberOfPages()}`, 283, 202, { align: "right" });
  }
  return doc.output("arraybuffer");
}

export async function createTakeoffWorkbook(data: TakeoffData): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs"); const book = new ExcelJS.Workbook(); book.creator = data.company;
  const { model, pending, notes } = data.result;
  const summary = book.addWorksheet("Levantamento"); summary.addRows([
    ["LEVANTAMENTO PRELIMINAR PARA COTAÇÃO"], ["Obra", data.project.name], ["Cliente", data.project.client], ["Empresa", data.company], ["Emissão", data.issued], ["Exemplo fictício", data.project.isExample ? "Sim" : "Não"],
    ["Linhas de tesouras", model.frameCount], ["Espaçamento entre tesouras (m)", model.frameSpacingM], ["Linhas de terças", model.purlinRows], ["Espaçamento na água (m)", model.purlinSpacingM],
    ["Área geométrica (m²)", model.roofAreaM2], ["Quantidade de peças", model.pieces.length], ["Comprimento total (m)", model.totalLengthM], [model.massComplete ? "Massa total (kg)" : "Massa conhecida parcial (kg)", model.knownMassKg],
    ["Hipóteses", data.project.planning?.specificationNotes || "Não informadas"],
  ]);
  const groups = book.addWorksheet("Lista de materiais"); groups.addRow(["Tipo", "Perfil", "Aço", "Seção", "Quantidade", "Comprimento geométrico (m)", "Total (m)", "Massa (kg)", "Comprimento comercial (m)", "Fonte", "IDs das peças"]);
  model.groups.forEach(g => groups.addRow([roleLabels[g.role], g.profile.name || "Pendente", g.profile.steelGrade || "Pendente", g.profile.section, g.pieceIds.length, g.lengthMm / 1000, g.totalLengthM, g.massKg ?? "Pendente", g.profile.stockLengthM ?? "Pendente", g.profile.source, g.pieceIds.join(", ")]));
  const parts = book.addWorksheet("Peças"); parts.addRow(["ID", "Tipo", "Perfil", "Nó inicial", "Nó final", "Comprimento (mm)", "Massa (kg)"]);
  model.pieces.forEach(p => parts.addRow([p.id, roleLabels[p.role], p.profile.name || "Pendente", p.start, p.end, p.lengthMm, p.massKg ?? "Pendente"]));
  const nodes = book.addWorksheet("Nós"); nodes.addRow(["ID", "X (mm)", "Y (mm)", "Z (mm)"]); model.nodes.forEach(n => nodes.addRow([n.id, n.x, n.y, n.z]));
  const checks = book.addWorksheet("Conferência final"); checks.addRow(["Pendências e hipóteses"]); [...pending, ...notes].forEach(note => checks.addRow([note]));
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.columns.forEach(column => { column.width = sheet === checks ? 120 : 28; });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242823" } };
    sheet.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  }
  return new Uint8Array(await book.xlsx.writeBuffer()).buffer;
}
