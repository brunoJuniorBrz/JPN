import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {z} from "zod";
import {projectSchema} from "@/domain/models";
import {prepareAnalysis} from "@/components/planning/mixed-analysis-mode";
import {runLocalMixed, runLocalSecondOrder} from "@/infrastructure/analysis/local-mixed-runner";

export const validationCaseSchema = z.object({
  schema_version: z.literal("jpn.validation-case/1"),
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  name: z.string().min(1),
  projectFile: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.project\.json$/),
  analysis_order: z.enum(["linear", "second-order"]),
  reference: z.object({kind: z.enum(["analytical", "external-tool", "real-project"]), citation: z.string().min(1),
    basis: z.string().min(1), reviewer: z.string().min(1), status: z.enum(["example-unreviewed", "reviewed-independent"])}).strict(),
  checks: z.array(z.object({
    pointer: z.string().regex(/^\/combinations\/[^/]+\/.+/),
    expected: z.number().finite(), unit: z.enum(["N", "N*m", "m", "rad", "dimensionless"]),
    tolerance: z.object({absolute: z.number().finite().nonnegative(), relative: z.number().finite().nonnegative()}).strict()
      .refine(t => t.absolute > 0 || t.relative > 0, "Declare a positive tolerance"),
    rationale: z.string().min(1),
  }).strict()).min(1),
}).strict().refine(c => new Set(c.checks.map(k => k.pointer)).size === c.checks.length, "Duplicate expected quantity");

/** RFC 6901 pointer, own properties only; no eval or fallback to zero. */
export function numericAt(value: unknown, pointer: string): number {
  if (!pointer.startsWith("/")) throw Error("INVALID_POINTER: " + pointer);
  let current: unknown = value;
  for (const encoded of pointer.slice(1).split("/")) {
    if (/~[^01]|~$/.test(encoded)) throw Error("INVALID_POINTER: " + pointer);
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) throw Error("MISSING_QUANTITY: " + pointer);
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current !== "number" || !Number.isFinite(current)) throw Error("NON_NUMERIC_QUANTITY: " + pointer);
  return current;
}

export function compareValue(actual: number, expected: number, tolerance: {absolute: number; relative: number}) {
  if (![actual, expected, tolerance.absolute, tolerance.relative].every(Number.isFinite) || tolerance.absolute < 0 || tolerance.relative < 0 || tolerance.absolute + tolerance.relative <= 0) throw Error("INVALID_COMPARISON");
  const difference = Math.abs(actual - expected), allowed = tolerance.absolute + tolerance.relative * Math.abs(expected);
  if (!Number.isFinite(difference) || !Number.isFinite(allowed)) throw Error("INVALID_COMPARISON: overflow");
  return {actual, expected, difference, allowed, passed: difference <= allowed};
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export async function runValidationCase(filename: string) {
  const caseText = readFileSync(filename, "utf8"), spec = validationCaseSchema.parse(JSON.parse(caseText));
  const projectText = readFileSync(path.join(path.dirname(filename), spec.projectFile), "utf8");
  const project = projectSchema.parse(JSON.parse(projectText));
  if (!project.workspace.physicalStructure) throw Error("PHYSICAL_PROJECT_REQUIRED");
  const prepared = await prepareAnalysis(project, spec.analysis_order);
  const payload = JSON.stringify(prepared.request);
  // Existing capped workers and result/hash validation; no alternative solver.
  const output = spec.analysis_order === "linear" ? await runLocalMixed(payload) : await runLocalSecondOrder(payload);
  if (output.status !== "completed") throw Error("ANALYSIS_NOT_COMPLETED");
  const checks = spec.checks.map(check => ({...check, ...compareValue(numericAt(output.result, check.pointer), check.expected, check.tolerance)}));
  return {schema_version: "jpn.validation-evidence/1", caseId: spec.id, caseSha256: sha(caseText), projectSha256: sha(projectText),
    inputSha256: prepared.input_sha256, analysisOrder: spec.analysis_order, solver: output.result.solver, reference: spec.reference,
    passed: checks.every(c => c.passed), checks, computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED"};
}
