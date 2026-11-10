import { jointActionTraceSchema, verifyJointActionTrace } from "@/domain/member-end-actions";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { mixedInputHash, verifyMixedResult } from "@/domain/mixed-analysis";
import { anyMixedRequestSchema, anyMixedResultSchema, verifyLoadingTrace } from "@/domain/structural-loading";
import { SolverFailure } from "./runner";
import { terminateWorker } from "./worker-process";

export const localMixedLimits = { inputBytes: 500000, outputBytes: 2000000, milliseconds: 20000, memoryBytes: 768 * 1024 * 1024, concurrency: 1 } as const;
const executionSchema = z.object({ memory_limit_bytes: z.literal(localMixedLimits.memoryBytes), memory_kind: z.enum(["windows-job-process-commit", "linux-address-space"]), local_only: z.literal(true) }).strict();
const envelopeSchema = z.object({ schema_version: z.literal("jpn.local-mixed/1"), status: z.literal("completed"), execution: executionSchema, result: anyMixedResultSchema, joint_actions:jointActionTraceSchema.optional() }).strict();
const healthSchema = z.object({ schema_version: z.literal("jpn.local-mixed/1"), status: z.literal("ready"), execution: executionSchema,
  dependencies: z.object({ python: z.literal("3.12"), PyNiteFEA: z.literal("3.2.1"), numpy: z.string(), scipy: z.string() }).strict() }).strict();
type Gate = { active: number; disabled: boolean };
const globals = globalThis as typeof globalThis & { __jpnLocalMixedGate?: Gate };
const gate = globals.__jpnLocalMixedGate ??= { active: 0, disabled: false };
// The P-Delta diagnostic shares this process slot and cleanup circuit breaker.
export const localMixedExecutionGate = gate;
export function localMixedEnabled() { return process.env.NODE_ENV === "development" && process.env.JPN_LOCAL_MIXED_ENABLED === "1" && process.env.JPN_LOCAL_MIXED_ORIGIN?.startsWith("http://127.0.0.1:"); }

export async function runLocalMixed(payload: string, mode: "health" | "analysis" | "connections" = "analysis", signal?: AbortSignal) {
  if (!localMixedEnabled()) throw new SolverFailure("LOCAL_ONLY", "Abra o JPN com pnpm dev:structural; execução mista restrita ao desenvolvimento local.");
  if (gate.disabled) throw new SolverFailure("CLEANUP_FAILURE", "Executor bloqueado após falha de limpeza. Reinicie o ambiente local.");
  if (Buffer.byteLength(payload) > localMixedLimits.inputBytes) throw new SolverFailure("INPUT_LIMIT", "Entrada excede 500 kB.");
  let request: ReturnType<typeof anyMixedRequestSchema.parse> | undefined;
  if (mode !== "health") {
    try { request = anyMixedRequestSchema.parse(JSON.parse(payload)); }
    catch { throw new SolverFailure("INVALID_INPUT", "Modelo misto incompleto ou incompatível com o contrato SI."); }
  }
  if (gate.active >= localMixedLimits.concurrency) throw new SolverFailure("BUSY", "Uma análise local já está em execução. Aguarde.");
  gate.active++;
  try {
    const portable = path.resolve(".tools/python/python.exe");
    const executable = process.env.JPN_PYTHON_EXECUTABLE || (existsSync(portable) ? portable : path.resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"));
    const raw = await new Promise<unknown>((resolve, reject) => {
      const child = spawn(executable, ["-I", "-X", "utf8", path.resolve("engine/local_mixed_worker.py"), ...(mode === "health" ? ["--health"] : []), ...(mode === "connections" ? ["--joint-actions"] : [])],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd(), env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1" } });
      const chunks: Buffer[] = []; let bytes = 0, stderrBytes = 0, settled = false;
      let failure: SolverFailure | null = null, cleanup: ReturnType<typeof setTimeout> | undefined;
      const finish = (value?: unknown, error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer); clearTimeout(cleanup); signal?.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(value);
      };
      const stop = (code: string, message: string) => {
        if (settled || failure) return;
        failure = new SolverFailure(code, message); terminateWorker(child);
        cleanup = setTimeout(() => { gate.disabled = true; finish(undefined, new SolverFailure("CLEANUP_FAILURE", "Processo não confirmou encerramento. Executor local bloqueado.")); }, 1500);
      };
      const cancel = () => stop("CANCELLED", "Entradas alteradas ou consulta cancelada; resultado descartado.");
      const timer = setTimeout(() => stop("TIMEOUT", "Análise excedeu 20 segundos; processo interrompido."), localMixedLimits.milliseconds);
      child.on("error", () => { if (child.pid) stop("SERVICE_FAILURE", "Falha no processo local; aguardando encerramento."); else finish(undefined, new SolverFailure("UNAVAILABLE", "Python 3.12 configurado não pôde ser iniciado.")); });
      child.stdin.on("error", () => stop("SERVICE_FAILURE", "Falha no envio ao worker local."));
      child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > localMixedLimits.outputBytes) stop("OUTPUT_LIMIT", "Saída excedeu 2 MB; processo interrompido."); else chunks.push(chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 16000) stop("OUTPUT_LIMIT", "Diagnóstico do worker excedeu o limite; sem resultado publicado."); });
      child.on("close", code => {
        if (failure) return finish(undefined, failure);
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (code !== 0 || parsed.status === "error") return finish(undefined, new SolverFailure(parsed.error?.code ?? "SERVICE_FAILURE", parsed.error?.message ?? "Processo recusou a análise; nenhum resultado publicado."));
          finish(parsed);
        } catch { finish(undefined, new SolverFailure("INVALID_RESPONSE", "Worker terminou sem resposta JSON válida; nenhum resultado publicado.")); }
      });
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel(); else child.stdin.end(mode !== "health" ? payload : ""); // Preserve raw duplicate keys for Python's strict decoder.
    });
    if (mode === "health") return healthSchema.parse(raw);
    const output = envelopeSchema.parse(raw);
    if(output.result.schema_version!==request!.schema_version.replace("mixed3d/","mixed3d-result/"))throw new Error("Versão de resposta incompatível.");
    verifyMixedResult(request!, output.result, await mixedInputHash(request));
    verifyLoadingTrace(request!,output.result);
    if(mode==="connections"){if(!output.joint_actions)throw new SolverFailure("JOINT_TRACE_UNAVAILABLE","Executor não forneceu ações de extremidade.");verifyJointActionTrace(request!,output.result,output.joint_actions);}
    return output;
  } catch (e) {
    if (e instanceof SolverFailure) throw e;
    throw new SolverFailure("INVALID_RESPONSE", "Resposta fora do contrato ou sem correspondência com as entradas.");
  } finally { gate.active--; }
}
