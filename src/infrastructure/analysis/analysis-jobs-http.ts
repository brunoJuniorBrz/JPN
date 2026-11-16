import { createHmac, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { getRun, start } from "workflow/api";
import { acceptsAssessmentGzip } from "./assessment-delivery";
import { runAnalysisJob, type JobKind, type JobOutcome } from "./analysis-job-workflow";
import { remoteMixedAccess, remoteMixedEnabled, remoteMixedLimits } from "./remote-mixed-runner";
import { SolverFailure } from "./runner";
import { secondOrderMixedRequestSchema, anyMixedRequestSchema } from "@/domain/structural-loading";
import { structuralAssessmentRequestSchema } from "@/domain/structural-assessment";
import { sectionAnalysisRequestSchema } from "@/domain/section-analysis";
import { verifiedColdformedRequestSchema } from "@/domain/coldformed-design";

const noStore = { "Cache-Control": "no-store" };
const retry = { ...noStore, "Retry-After": "2" };
const jobPath = "/api/experimental/jobs";
const schemas = {
  mixed: anyMixedRequestSchema, connections: anyMixedRequestSchema, "second-order": secondOrderMixedRequestSchema,
  "structural-assessment": structuralAssessmentRequestSchema, section: sectionAnalysisRequestSchema,
  design: verifiedColdformedRequestSchema,
};
export const analysisJobsEnabled = () => process.env.JPN_ANALYSIS_ASYNC_ENABLED === "1";
export function prefersAsync(request: Request) {
  return request.headers.get("Prefer")?.split(",").some(value => value.trim().toLowerCase() === "respond-async") ?? false;
}

function sign(runAndHash: string) {
  const key = process.env.JPN_ANALYSIS_JOB_KEY;
  if (!key || key.length < 32)
    throw new SolverFailure("CONFIGURATION", "Configure a assinatura privada da fila de análise.");
  return createHmac("sha256", key).update("jpn-analysis-job/1\0").update(process.env.JPN_MIXED_ACCESS_USER ?? "")
    .update("\0").update(runAndHash).digest("hex");
}

export async function enqueueAnalysis(kind: JobKind, payload: string, requestSha: string) {
  if (!analysisJobsEnabled())
    throw new SolverFailure("CONFIGURATION", "Fila durável de análise desativada.");
  if (!schemas[kind].safeParse(JSON.parse(payload)).success)
    throw new SolverFailure("INVALID_INPUT", "Entrada incompatível com o contrato de análise.");
  sign("");
  let runId: string;
  try {
    ({ runId } = await start(runAnalysisJob, [kind, payload]));
  } catch {
    throw new SolverFailure("UNAVAILABLE", "Não foi possível registrar a análise na fila.");
  }
  const runAndHash = `${runId}.${requestSha}`;
  const job = `${runAndHash}.${sign(runAndHash)}`;
  const statusUrl = `${jobPath}/${job}`;
  return Response.json({ status: "pending", job, status_url: statusUrl, request_sha256: requestSha },
    { status: 202, headers: { ...retry, Location: statusUrl, "Preference-Applied": "respond-async" } });
}

function jobError(code: string, message: string, status: number, headers: HeadersInit = noStore) {
  return Response.json({ status: "error", error: { code, message } }, { status, headers });
}

export async function pollAnalysis(request: Request, job: string) {
  if (!remoteMixedEnabled() || !analysisJobsEnabled())
    return jobError("NOT_FOUND", "Fila indisponível.", 404);
  const denied = remoteMixedAccess(request);
  if (denied) return jobError(denied.code, denied.message, denied.status, denied.status === 401
    ? { ...noStore, "WWW-Authenticate": 'Basic realm="JPN experimental", charset="UTF-8"' } : noStore);
  const match = /^([A-Za-z0-9_-]{1,140})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(job);
  if (!match) return jobError("JOB_NOT_FOUND", "Análise não encontrada.", 404);
  const [, runId, requestSha, signature] = match;
  try {
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(`${runId}.${requestSha}`), "hex")))
      return jobError("JOB_NOT_FOUND", "Análise não encontrada.", 404);
    const run = getRun<JobOutcome>(runId);
    if (!await run.exists) return jobError("JOB_NOT_FOUND", "Análise inexistente ou expirada.", 404);
    const state = await run.status;
    const receipt = { job, request_sha256: requestSha };
    if (state === "pending" || state === "running")
      return Response.json({ ...receipt, status: state }, { status: 202, headers: retry });
    if (state !== "completed")
      return jobError(state === "cancelled" ? "CANCELLED" : "WORKFLOW_FAILED", "Execução encerrada sem resultado.", 422);
    const outcome = await run.returnValue;
    if (outcome.status === "error")
      return Response.json({ ...receipt, ...outcome }, { status: 422, headers: noStore });
    if (new URL(request.url).searchParams.get("result") !== "1")
      return Response.json({ ...receipt, status: "ready", result_url: `${jobPath}/${job}?result=1` }, { headers: noStore });
    const headers = { ...noStore, "Content-Type": "application/json", "X-JPN-Request-Sha256": requestSha,
      Vary: "Accept-Encoding" };
    if (acceptsAssessmentGzip(request.headers.get("Accept-Encoding")))
      return new Response(new Uint8Array(outcome.body), { headers: { ...headers, "Content-Encoding": "gzip" } });
    if (outcome.jsonBytes > remoteMixedLimits.outputBytes)
      return jobError("OUTPUT_LIMIT", "Solicite o resultado com Accept-Encoding: gzip.", 422);
    const body = await promisify(gunzip)(outcome.body, { maxOutputLength: remoteMixedLimits.outputBytes });
    return new Response(new Uint8Array(body), { headers });
  } catch {
    return jobError("UNAVAILABLE", "Não foi possível consultar a fila. Tente novamente.", 503, retry);
  }
}
