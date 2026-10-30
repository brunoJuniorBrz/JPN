import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { planningExample } from "@/domain/planning-example";
import { defaultSettings } from "@/domain/models";
import { createTakeoffPdf, createTakeoffWorkbook, takeoffData } from "./takeoff";

it("exporta quantitativos sem preços, inclui pendências e reabre valores exatos no XLSX", async () => {
  const project = planningExample(); project.planning!.profiles.column.name = ""; project.planning!.profiles.column.massKgM = null;
  const input = takeoffData(project, defaultSettings);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await createTakeoffWorkbook(input));
  expect(book.getWorksheet("Peças")!.rowCount).toBe(124);
  expect(book.getWorksheet("Levantamento")!.getCell("B7").value).toBe(5);
  expect(book.getWorksheet("Levantamento")!.getCell("B11").value).toBeCloseTo(200.9975124224, 8);
  expect(book.getWorksheet("Lista de materiais")!.getCell("B2").value).toBe("Pendente");
  const task = getDocument({ data: new Uint8Array(await createTakeoffPdf(input)), useSystemFonts: true }); const doc = await task.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
  expect(text).toContain("LEVANTAMENTO PARA COTAÇÃO"); expect(text).toContain("T1-BS1"); expect(text).toContain("perfil não definido");
  expect(text).toContain("EXEMPLO FICTÍCIO"); expect(text).not.toContain("Lucro"); expect(text).not.toContain("R$");
  await task.destroy();
});
