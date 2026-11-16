import { adaptLoadedMixedProjectV3 } from "@/domain/loaded-mixed-adapter";
import { mixedInputHash, verifyMixedResult } from "@/domain/mixed-analysis";
import { anyMixedResultSchema, secondOrderMixedRequestSchema, secondOrderMixedResultSchema, verifyLoadingTrace, verifySecondOrderDemandTrace } from "@/domain/structural-loading";
import type { Project } from "@/domain/models";

export type AnalysisOrder = "linear" | "second-order";
export async function prepareAnalysis(project: Project, order: AnalysisOrder) {
  const prepared = await adaptLoadedMixedProjectV3(project);
  if (order === "linear") return prepared;
  const request = secondOrderMixedRequestSchema.parse({ ...prepared.request, solution_mode: "per-combination", analysis_order: "second-order" });
  return { ...prepared, request, input_sha256: await mixedInputHash(request) };
}
export type PreparedAnalysis = Awaited<ReturnType<typeof prepareAnalysis>>;
export type AnalysisResult = ReturnType<typeof anyMixedResultSchema.parse> | ReturnType<typeof secondOrderMixedResultSchema.parse>;
export function readAnalysis(prepared: PreparedAnalysis, value: unknown): AnalysisResult {
  if ("analysis_order" in prepared.request) {
    const result = secondOrderMixedResultSchema.parse(value);
    verifyMixedResult(prepared.request, result, prepared.input_sha256);
    verifySecondOrderDemandTrace(secondOrderMixedRequestSchema.parse(prepared.request), result);
    return result;
  }
  const result = anyMixedResultSchema.parse(value);
  if (result.schema_version !== "jpn.mixed3d-result/3") throw Error("Versão de resposta incompatível.");
  verifyMixedResult(prepared.request, result, prepared.input_sha256);
  verifyLoadingTrace(prepared.request, result);
  return result;
}
export const isSecondOrder = (result: AnalysisResult): result is ReturnType<typeof secondOrderMixedResultSchema.parse> => "analysis_order" in result;
export const solverRevision = (result: AnalysisResult) => "version" in result.solver ? result.solver.version : result.solver.method;

/** Diagnostic computed by the existing solver, not a normative drift classifier.
 * No reviewed NBR 8800 classification procedure/limit exists in this UI domain. */
export function swayDiagnostic(result: AnalysisResult, combination: string) {
  if (!isSecondOrder(result)) return null;
  const c = result.combinations[combination];
  return c ? { ratio: c.amplification_factor, measure: c.amplification_measure } : null;
}

/** Same geometric observation as second-order-readiness: not inter-storey drift
 * or an NBR 8800 classification. No limit or normative threshold is assumed. */
export function observedTranslationRatio(nodes: readonly { x_m: number; y_m: number; z_m: number }[], response: Record<string, { translation_m: readonly number[] }>) {
  if (!nodes.length) return null;
  const span = Math.max(...(["x_m", "y_m", "z_m"] as const).map(axis => Math.max(...nodes.map(n => n[axis])) - Math.min(...nodes.map(n => n[axis]))));
  const translations = Object.values(response).map(n => Math.hypot(...n.translation_m));
  if (!(span > 0) || !translations.length || !translations.every(Number.isFinite)) return null;
  return Math.max(...translations) / span;
}
