import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { planningExample } from "@/domain/planning-example";
import { buildPreproductionDossier } from "@/domain/calculations/preproduction";
import { createPreproductionPdf, createPreproductionWorkbook } from "./preproduction";

describe("M25 - conferir conteúdo real dos documentos exportados", () => {
  it("abre o Excel e confronta IDs, quantidade, comprimento e avisos com o modelo físico", async () => {
    const project = planningExample();
    project.name = '=HYPERLINK("https://example.com","teste")';
    const dossier = buildPreproductionDossier(project);
    const before = JSON.stringify(project);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await createPreproductionWorkbook(project));

    const summary = workbook.getWorksheet("Resumo")!;
    const groups = workbook.getWorksheet("Grupos de materiais")!;
    const pieces = workbook.getWorksheet("Peças")!;
    const issues = workbook.getWorksheet("Pendências por peça")!;
    const cutting = workbook.getWorksheet("Corte simulado")!;

    expect(summary.getCell("B3").value).toBe(project.name); // literal, not a spreadsheet formula
    expect(summary.getCell("B7").value).toBe(dossier.pieces.length);
    expect(summary.getCell("B8").value).toBe(dossier.groups.length);
    expect(summary.getCell("B9").value).toBeCloseTo(dossier.totals.geometricLengthMm, 8);
    expect(summary.getCell("B15").value).toBe("NÃO");
    expect(summary.getCell("B14").value).toBe("preliminary-not-released");
    expect(pieces.rowCount).toBe(dossier.pieces.length + 1);
    expect(groups.rowCount).toBe(dossier.groups.length + 1);
    expect(issues.rowCount).toBe(dossier.issues.length + 1);
    expect(cutting.getCell("K1").value).toBe("Situação");

    const rowById = new Map<string, number>();
    for (let row = 2; row <= pieces.rowCount; row++) {
      const id = pieces.getRow(row).getCell(1).value;
      expect(typeof id).toBe("string");
      expect(rowById.has(id as string)).toBe(false);
      rowById.set(id as string, row);
    }
    for (const piece of dossier.pieces) {
      const rowNumber = rowById.get(piece.id);
      expect(rowNumber).toBeDefined();
      const row = pieces.getRow(rowNumber!);
      expect(row.getCell(6).value).toBe(piece.startNode);
      expect(row.getCell(7).value).toBe(piece.endNode);
      expect(row.getCell(8).value).toBeCloseTo(piece.geometricLengthMm, 8);
      expect(row.getCell(9).value).toBe("Pendente");
      expect(row.getCell(10).value).toBe("missing");
    }
    expect(dossier.issues.some(issue => issue.code === "DESIGN_UNVERIFIED")).toBe(true);
    expect(dossier.approvedForFabrication).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });

  it("reabre o PDF e confere avisos, pendências e IDs das peças presentes no documento", async () => {
    const project = planningExample();
    const dossier = buildPreproductionDossier(project);
    const task = getDocument({
      data: new Uint8Array(await createPreproductionPdf(project)),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    try {
      expect(pdf.numPages).toBeGreaterThanOrEqual(3);
      const pageText: string[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        pageText.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
      }
      const text = pageText.join(" ");
      expect(text).toContain("DOSSIÊ DE PRÉ-FABRICAÇÃO");
      expect(text).toContain("PENDÊNCIAS DE ENGENHARIA");
      expect(text).toContain("SIMULAÇÃO DE CORTE");
      expect(text).toContain("NÃO É ORDEM DE COMPRA");
      expect(text).toContain(dossier.groups[0].profileName || "A definir");
      expect(text).toContain(dossier.groups[0].ids[0]);
      expect(text).toContain("Dimensionamento completo");
      expect(text).not.toContain("LIBERADO PARA FABRICAÇÃO");
      for (const perPage of pageText) expect(perPage).toContain("NÃO É ORDEM DE COMPRA");
    } finally {
      await task.destroy();
    }
  });
});
