import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { exampleProject } from "@/domain/example";
import { defaultSettings, projectSchema } from "@/domain/models";
import { commercialProposal, proposalPending } from "./proposal";
import { createProposalPdf } from "./pdf";
import { createInternalWorkbook } from "./workbook";

describe("documentos do orçamento", () => {
  it("abre projetos v2 anteriores sem inventar condições comerciais", () => {
    const old = JSON.parse(JSON.stringify(exampleProject()));
    delete old.estimate.paymentTerms; delete old.estimate.validity; delete old.estimate.exclusions;
    const parsed = projectSchema.parse(old);
    expect(parsed.estimate.paymentTerms).toBe("");
    expect(proposalPending(parsed)).toContain("Informe a forma de pagamento.");
    expect(() => commercialProposal(parsed, defaultSettings)).toThrow();
  });
  it("bloqueia documentos com preços incompletos", async () => {
    const project = exampleProject(); project.estimate.materials[0].unitPriceCents = null;
    expect(() => commercialProposal(project, defaultSettings)).toThrow();
    await expect(createInternalWorkbook(project, defaultSettings)).rejects.toThrow();
  });
  it("gera PDF legível, com valor correto e sem dados internos, inclusive em várias páginas", async () => {
    const project = exampleProject(); project.technicalNotes = "SEGREDO_INTERNO";
    project.description = "Serviço de cobertura metálica. ".repeat(140);
    const proposal = commercialProposal(project, defaultSettings, new Date("2026-10-26T12:00:00Z"));
    expect(proposal).not.toHaveProperty("estimate");
    const task = getDocument({ data: new Uint8Array(createProposalPdf(proposal)), useSystemFonts: true });
    const pdf = await task.promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); const content = await page.getTextContent();
      text += content.items.map(item => "str" in item ? item.str : "").join(" ");
    }
    expect(text).toContain("9.831,50"); expect(text).toContain("26/10/2026");
    expect(text).toContain("EXEMPLO FICTÍCIO"); expect(text).toContain("metálica");
    expect(text).toContain("PAGAMENTO"); expect(text).toContain("VALIDADE");
    expect(text).not.toContain("SEGREDO_INTERNO"); expect(text).not.toContain("7.865,20"); expect(text).not.toContain("markup");
    await task.destroy();
  });
  it("planilha reaberta preserva números, quantidades e textos sem executar fórmulas", async () => {
    const project = exampleProject(); project.name = '=HYPERLINK("https://example.com")';
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await createInternalWorkbook(project, defaultSettings));
    const summary = book.getWorksheet("Resumo interno")!;
    expect(summary.getCell("B3").value).toBe(project.name);
    expect(summary.getCell("B11").value).toBe(7865.2);
    expect(summary.getCell("B12").value).toBe(9831.5);
    expect(summary.getCell("B13").value).toBe(1966.3);
    expect(book.getWorksheet("Itens e custos")!.getCell("C2").value).toBe(63.315);
    expect(book.getWorksheet("Itens e custos")!.getCell("C3").value).toBe(4);
  });
});
