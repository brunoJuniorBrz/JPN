import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newProject } from "./models";
import { applyTrussToProject, trussEditorSchema, trussSummary } from "./truss-editor";
import { packageTakeoff } from "@/lib/exports/package-source";
import { packageCutting } from "@/lib/exports/complete-package";

/** TESTE OBRIGATÓRIO 1 (docs/CRITERIOS-DE-APROVACAO.md): obra antiga, dados iguais => MESMA lista de materiais.
 * O gabarito foi gerado com o código da main ANTES das mudanças (commit 6423d78) e nunca deve ser
 * regenerado pelo código novo. Se este teste falhar, a mudança alterou o material de obras existentes. */
const golden = JSON.parse(readFileSync(new URL("./test-support/truss-materials-golden.json", import.meta.url), "utf8")) as Record<string, {
  input: unknown;
  summary: { lines: unknown[]; kg: Record<string, number>; bars: unknown; buy: unknown; plates: number; bolts: number; columnCount: number; knownCents: number };
  takeoff: { totals: { quantity: number; lengthM: number; massKg: number }; groups: { key: string; profile: unknown; count: unknown; totalLengthMm: unknown; massKg: unknown }[] };
  cutting: { profile: string; bars: number }[];
}>;

describe("lista de materiais de obras antigas não muda", () => {
  for (const [name, g] of Object.entries(golden)) it(name, () => {
    const t = trussEditorSchema.parse(g.input), s = trussSummary(t);
    expect(s.lines).toEqual(g.summary.lines);
    for (const [k, v] of Object.entries(g.summary.kg)) expect(s.kg[k as keyof typeof s.kg]).toBeCloseTo(v, 9);
    expect(s.bars).toEqual(g.summary.bars);
    expect(s.buy).toEqual(g.summary.buy);
    expect([s.plates, s.bolts, s.columnCount, s.knownCents]).toEqual([g.summary.plates, g.summary.bolts, g.summary.columnCount, g.summary.knownCents]);
    const p = applyTrussToProject(newProject(), t), report = packageTakeoff(p);
    expect(report.totals.quantity).toBe(g.takeoff.totals.quantity);
    expect(report.totals.lengthM).toBeCloseTo(g.takeoff.totals.lengthM, 9);
    expect(report.totals.massKg).toBeCloseTo(g.takeoff.totals.massKg, 9);
    expect(report.groups.map(x => x.key)).toEqual(g.takeoff.groups.map(x => x.key));
    report.groups.forEach((x, i) => expect((x as { massKg: number }).massKg).toBeCloseTo(g.takeoff.groups[i].massKg as number, 6));
    const cut = packageCutting(p, { stockByGroup: Object.fromEntries(report.groups.map(x => [x.key, 12000])) });
    expect(cut.groups.map(x => ({ profile: x.profile, bars: x.bars.length }))).toEqual(g.cutting);
  });
});
