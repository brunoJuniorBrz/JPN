import type { Project } from "@/domain/models";
import { projectCutting } from "@/domain/calculations/cutting";
import { formatMeasure } from "@/domain/calculations/units";

export async function createCuttingSimulationPdf(project: Project) {
  const plan = projectCutting(project);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape" });
  autoTable(doc, { startY: 40, margin: { top: 40, bottom: 20 }, head: [["Perfil", "Barra", "Compr. (mm)", "Peças / comprimentos (mm)", "Cortes + extremos (mm)", "Sobra (mm)", "Aproveitamento"]],
    body: plan.groups.flatMap(g => g.bars.map(b => [g.profile, `${g.groupId}-${b.id}`, formatMeasure(b.stockMm), b.pieces.map(p => `${p.id}: ${formatMeasure(p.lengthMm, 3)}`).join("; "), formatMeasure(b.kerfMm + b.trimMm), formatMeasure(b.remainderMm), `${formatMeasure(g.utilizationPercent, 2)}% (grupo)`])), styles: { fontSize: 8, overflow: "linebreak" }, columnStyles: { 3: { cellWidth: 100 } } });
  for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); doc.setFontSize(14); doc.text("SIMULAÇÃO DE APROVEITAMENTO — NÃO LIBERADA PARA CORTE", 14, 16); doc.setFontSize(9); doc.text(doc.splitTextToSize(`${project.name} · revisão geométrica ${project.roof.revision} · First Fit Decreasing: heurística, sem prova de ótimo. ${project.workspace.cutting.useFabrication ? "Comprimentos finais declarados, ainda sujeitos à revisão." : "Comprimentos geométricos, sem descontos de fabricação."}`, 270), 14, 25); doc.text(`Uma perda de serra por peça; perdas explícitas nas duas extremidades. ${i}/${doc.getNumberOfPages()}`, 14, 200); }
  return doc.output("arraybuffer");
}
