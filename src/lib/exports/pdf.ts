import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { moneyLabel } from "@/domain/calculations/estimate";
import type { CommercialProposal } from "./proposal";
import { formatMeasure } from "@/domain/calculations/units";

export function createProposalPdf(proposal: CommercialProposal): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `Orçamento ${proposal.reference} - ${proposal.name}`, author: proposal.company });
  const rows: [string, string][] = [
    ["EMPRESA", `${proposal.company}${proposal.businessInfo ? `\n${proposal.businessInfo}` : ""}`],
    ["CLIENTE", `${proposal.client}${proposal.phone ? `\n${proposal.phone}` : ""}`],
    ["OBRA", `${proposal.name}${proposal.location ? `\n${proposal.location}` : ""}`],
    ["SERVIÇO INCLUÍDO", proposal.scope],
    ["VALOR TOTAL", moneyLabel(proposal.saleCents)],
    ["PAGAMENTO", proposal.paymentTerms], ["PRAZO", proposal.deadline],
    ["VALIDADE", proposal.validity],
  ];
  if (proposal.items.length) rows.splice(4, 0, ["ITENS PREVISTOS", proposal.items.map(item => `${item.description}: ${formatMeasure(item.quantity, 6)} ${item.unit}`).join("\n")]);
  if (proposal.exclusions) rows.push(["NÃO INCLUÍDO", proposal.exclusions]);
  if (proposal.notes) rows.push(["OBSERVAÇÕES", proposal.notes]);
  rows.push(["CONFERÊNCIA TÉCNICA", "Orçamento preliminar. Dimensões e especificações sujeitas à conferência técnica. Este documento não substitui projeto estrutural."]);
  autoTable(doc, {
    startY: 43, margin: { top: 43, bottom: 22, left: 18, right: 18 },
    body: rows, theme: "plain", styles: { font: "helvetica", fontSize: 11, cellPadding: 4, overflow: "linebreak", textColor: [35, 42, 43] },
    columnStyles: { 0: { cellWidth: 43, fontSize: 9, fontStyle: "bold", textColor: [83, 88, 87] }, 1: { cellWidth: 131 } },
    alternateRowStyles: { fillColor: [246, 246, 242] },
    didParseCell: data => {
      if (Array.isArray(data.row.raw) && data.row.raw[0] === "VALOR TOTAL") { data.cell.styles.fillColor = [234, 224, 193]; data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = data.column.index === 1 ? 18 : 10; }
    },
    didDrawPage: () => {
      doc.setFillColor(32, 44, 44); doc.rect(0, 0, 210, 34, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont("helvetica", "bold");
      doc.text("ORÇAMENTO", 18, 15); doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(`Nº ${proposal.reference}  |  Emissão: ${proposal.issuedAt}`, 18, 24);
      if (proposal.isExample) { doc.setTextColor(255, 220, 139); doc.text("EXEMPLO FICTÍCIO", 191, 15, { align: "right" }); }
    },
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setTextColor(90); doc.setFontSize(9);
    doc.text(proposal.isExample ? "Demonstração. Não usar como proposta comercial." : `Orçamento ${proposal.reference}`, 18, 284);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, 192, 284, { align: "right" });
  }
  return doc.output("arraybuffer");
}
