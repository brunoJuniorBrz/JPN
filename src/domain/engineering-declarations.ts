import { z } from "zod";
import type { Project } from "./models";
import { spatialPreparationSchema } from "./spatial-preparation";
import { emptyLoading } from "./structural-loading";
import { windDeclarationSchema } from "./wind-contracts";
import { engineeringCombinationsSchema, compileEngineeringCombinations } from "./engineering-combinations";
import { distributeWindActions } from "./wind-load-path";

export const engineeringPackageSchema = z.object({
  schema_version:z.literal("jpn.engineering-package/1"),wind:windDeclarationSchema,
  combinations:engineeringCombinationsSchema,
}).strict();

/** Atomic import: existing physical loads/properties stay intact. Explicitly
 * replaces the combination table; cannot reuse a duplicate-action review. */
export function applyEngineeringPackage(project: Project, value: unknown): Project {
  const pack = engineeringPackageSchema.parse(value), d = project.workspace.spatialPreparation;
  if (!d) throw new Error("Declare primeiro o modelo físico da obra.");
  const oldWindCases = new Set(d.loading?.wind?.cases.map(c=>c.id)??[]);
  const cases = d.cases.filter(c=>!oldWindCases.has(c.id));
  if (pack.wind.cases.some(c=>cases.some(x=>x.id===c.id))) throw new Error("WIND_CASE_COLLISION: caso de vento colide com ação existente.");
  cases.push(...pack.wind.cases.map(c=>({id:c.id,source:c.reference.source})));
  const combinations = compileEngineeringCombinations(pack.combinations,cases.map(c=>c.id)).combinations;
  const loading = {...(d.loading??emptyLoading()),wind:pack.wind}; delete loading.overlapReview;
  const draft = spatialPreparationSchema.parse({...d,cases,combinations,engineeringCombinations:pack.combinations,loading});
  const next = {...project,workspace:{...project.workspace,spatialPreparation:draft}};
  // Pure preflight; never invokes solver or supplies missing physical data.
  distributeWindActions(next,pack.wind);
  return next;
}
