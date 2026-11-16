import { RetryableError } from "workflow";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { runRemoteMixed, runRemoteSecondOrder, remoteMixedLimits } from "./remote-mixed-runner";
import { runRemoteStructuralAssessment } from "./local-structural-assessment-runner";
import { runRemoteSection } from "./remote-section-runner";
import { assessmentCompressedInputBytes } from "./assessment-delivery";
import { SolverFailure } from "./runner";

export type JobKind = "mixed" | "second-order" | "connections" | "structural-assessment" | "section" | "design";
export type JobOutcome =
  | { status: "ready"; body: Uint8Array; jsonBytes: number }
  | { status: "error"; error: { code: string; message: string; combination_id?: string } };

export async function runAnalysisJob(kind: JobKind, payload: string): Promise<JobOutcome> {
  "use workflow";
  return executeAnalysis(kind, payload);
}

export async function executeAnalysis(kind: JobKind, payload: string): Promise<JobOutcome> {
  "use step";
  try {
    const result = kind === "second-order" ? await runRemoteSecondOrder(payload, undefined, true)
      : kind === "mixed" || kind === "connections"
        ? await runRemoteMixed(payload, kind === "connections" ? kind : "analysis", undefined, true)
        : kind === "structural-assessment" ? await runRemoteStructuralAssessment(payload, undefined, true, true)
        : await runRemoteSection(payload, undefined, kind, true);
    const json = Buffer.from(JSON.stringify(result));
    if (json.length > assessmentCompressedInputBytes)
      throw new SolverFailure("OUTPUT_LIMIT", "Resultado excede o limite de leitura.");
    const body = await promisify(gzip)(json);
    if (body.length > remoteMixedLimits.outputBytes)
      throw new SolverFailure("OUTPUT_LIMIT", "Resultado comprimido excede 2 MB.");
    return { status: "ready", body: new Uint8Array(body), jsonBytes: json.length };
  } catch (cause) {
    const error = cause instanceof SolverFailure ? cause : new SolverFailure("INVALID_INPUT", "Entrada incompatível com a análise.");
    if (error.code === "BUSY") throw new RetryableError("Executor ocupado.", { retryAfter: "15s" });
    return { status: "error", error: { code: error.code, message: error.message,
      ...("combinationId" in error && typeof error.combinationId === "string" ? { combination_id: error.combinationId } : {}) } };
  }
}
executeAnalysis.maxRetries = 2;
