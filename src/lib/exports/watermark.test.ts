import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { newProject } from "@/domain/models";
import { applyTrussToProject, tomTrussDefaults } from "@/domain/truss-editor";
import { createCompletePackage } from "./complete-package";
import { packageTakeoff } from "./package-source";
import { watermarkLines } from "./watermark";

async function pageTexts(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice() }).promise, out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => "str" in x ? x.str : "").join(" "));
  return out;
}

describe("marca d'água Shimizu", () => {
  const issuedAt = new Date("2026-11-27T12:00:00Z");
  const project = () => { const p = applyTrussToProject(newProject(), tomTrussDefaults()); p.client = "Dona Maria"; return p; };
  const options = (p: ReturnType<typeof project>) => ({ issuedAt, stockByGroup: Object.fromEntries(packageTakeoff(p).groups.map(g => [g.key, 6000])) });

  it("texto com marca, cliente e data", () => {
    expect(watermarkLines({ brand: "Shimizu", client: "Dona Maria", issuedAt })).toEqual(["Shimizu · uso exclusivo · cópia para orçamento", "Cliente: Dona Maria · 27/11/2026"]);
    expect(watermarkLines({ brand: "Shimizu", client: " ", issuedAt })[1]).toBe("27/11/2026");
  });

  it("vai em todas as folhas do PDF (inclusive a Folha da Oficina) e não vai no DXF", async () => {
    const p = project(), pkg = await createCompletePackage(p, options(p));
    const file = (name: string) => pkg.files.find(f => f.name === name)!.bytes;
    const sheets = await pageTexts(file("pranchas/pranchas.pdf"));
    expect(sheets.length).toBeGreaterThan(1);
    for (const text of sheets) { expect(text).toContain("Shimizu"); expect(text).toContain("Dona Maria"); }
    for (const text of await pageTexts(file("memorial/quantitativos.pdf"))) expect(text).toContain("Shimizu");
    expect(new TextDecoder().decode(file("cad/pranchas.dxf"))).not.toContain("Shimizu");
  });

  it("versão interna sai limpa quando pedida", async () => {
    const p = project(), pkg = await createCompletePackage(p, { ...options(p), watermark: false });
    for (const text of await pageTexts(pkg.files.find(f => f.name === "pranchas/pranchas.pdf")!.bytes)) expect(text).not.toContain("Shimizu");
  });
});
