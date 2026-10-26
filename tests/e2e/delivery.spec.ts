import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { EXAMPLE_ID } from "../../src/domain/example";

test("entrega PDF e planilha, persiste condições e bloqueia PDF incompleto", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projetos/${EXAMPLE_ID}?etapa=4`);
  const downloadButton = page.getByRole("button", { name: "Baixar orçamento em PDF" });
  await expect(downloadButton).toBeEnabled();
  await page.getByLabel("Forma de pagamento", { exact: true }).fill("");
  await expect(downloadButton).toBeDisabled();
  await page.getByLabel("Forma de pagamento", { exact: true }).fill("Pagamento na entrega — teste");
  await page.getByLabel("Validade do orçamento", { exact: true }).fill("15 dias da emissão");
  const pdfWait = page.waitForEvent("download"); await downloadButton.click(); const pdf = await pdfWait;
  expect(pdf.suggestedFilename()).toMatch(/^orcamento-.*\.pdf$/);
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByRole("status").filter({ hasText: "PDF gerado" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Forma de pagamento", { exact: true })).toHaveValue("Pagamento na entrega — teste");
  await page.getByText("Planilha para uso interno", { exact: true }).click();
  const xlsxWait = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar planilha interna" }).click(); const xlsx = await xlsxWait;
  expect(xlsx.suggestedFilename()).toMatch(/^uso-interno-.*\.xlsx$/);
  expect((await readFile((await xlsx.path())!)).subarray(0, 2).toString()).toBe("PK");
  expect(errors).toEqual([]);
});

test("não emite documento se o navegador falhar ao salvar", async ({ page }) => {
  await page.goto(`/projetos/${EXAMPLE_ID}?etapa=4`);
  const button = page.getByRole("button", { name: "Baixar orçamento em PDF" });
  await expect(button).toBeEnabled();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Sem espaço", "QuotaExceededError"); }; });
  const downloads: string[] = []; page.on("download", download => downloads.push(download.suggestedFilename()));
  await button.click();
  await expect(page.getByRole("alert").filter({ hasText: "Resolva o aviso de armazenamento" })).toBeVisible();
  expect(downloads).toEqual([]);
});
