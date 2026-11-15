import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { postAnalysis, type JobProgress } from "./async-job-client";

const sha = async (text: string) => createHash("sha256").update(text).digest("hex");
const INPUT = "d".repeat(64);
// A galpão in second order with 42 ULS combinations: the transport treats the body as opaque bytes and carries its hash.
const body = JSON.stringify({ schema_version: "jpn.mixed3d/3", analysis_order: "second-order", solution_mode: "per-combination",
  combinations: Array.from({ length: 42 }, (_, i) => ({ id: "ELU" + (i + 1), factors: { G: 1.25, Q: 1.5 } })) });
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
const completed = { status: "completed", schema_version: "jpn.remote-mixed/1", result: { input_sha256: INPUT, combinations: {} } };

function harness(script: ((url: string, init: RequestInit) => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [], sleeps: number[] = []; let clock = 0;
  const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); const next = script.shift(); if (!next) throw new Error("fetch inesperado " + url); return next(url, init); }) as typeof fetch;
  return { calls, sleeps, options: { body, signal: new AbortController().signal, fetcher, sha256: sha, sleep: async (ms: number) => { sleeps.push(ms); clock += ms; }, now: () => clock } };
}

describe("fila durável de análise (cliente)", () => {
  it("202 → pendente → rodando → pronto → resultado; status visível a cada consulta e recibo preso ao hash do corpo", async () => {
    const requestSha = await sha(body), job = "run_123." + requestSha + "." + "f".repeat(64), progress: JobProgress[] = [];
    const h = harness([
      () => json({ status: "pending", job, status_url: "/api/experimental/jobs/" + job, request_sha256: requestSha }, 202, { "Retry-After": "2" }),
      () => json({ job, request_sha256: requestSha, status: "pending" }, 202, { "Retry-After": "2" }),
      () => json({ job, request_sha256: requestSha, status: "running" }, 202, { "Retry-After": "3" }),
      () => json({ job, request_sha256: requestSha, status: "ready", result_url: "/api/experimental/jobs/" + job + "?result=1" }),
      () => json(completed, 200, { "X-JPN-Request-Sha256": requestSha }),
    ]);
    const out = await postAnalysis("/api/experimental/mixed3d", { ...h.options, onProgress: p => progress.push(p) });
    expect(out.viaJob).toBe(true); expect(out.job).toBe(job); expect(out.requestSha256).toBe(requestSha); expect(out.out).toEqual(completed);
    expect(progress.map(p => p.state)).toEqual(["pending", "running", "ready"]);
    expect(h.sleeps).toEqual([2000, 2000, 3000]);
    expect(new Headers(h.calls[0].init.headers).get("Prefer")).toBe("respond-async");
    expect(h.calls[0].init.body).toBe(body);
    // The delivered result keeps its input_sha256 (the caller verifies it against the request; the Studio layer check of #123 binds to it).
    expect((out.out as typeof completed).result.input_sha256).toBe(INPUT);
  });

  it("resposta síncrona (execução local ou rápida) segue o caminho normal sem fila", async () => {
    const h = harness([() => json(completed, 200, { "X-JPN-Request-Sha256": "a".repeat(64) })]);
    const out = await postAnalysis("/api/experimental/mixed3d", h.options);
    expect(out.viaJob).toBe(false); expect(out.out).toEqual(completed); expect(h.calls).toHaveLength(1);
  });

  it("erros nunca são silenciosos: recusa síncrona, job com erro, recibo adulterado, job inexistente e espera longa nomeiam o código", async () => {
    await expect(postAnalysis("/x", harness([() => json({ error: { code: "INVALID_INPUT", message: "Entrada incompatível." } }, 400)]).options)).rejects.toThrow("INVALID_INPUT: Entrada incompatível.");
    const requestSha = await sha(body), job = "run_1." + requestSha + "." + "f".repeat(64), receipt = () => json({ job, status_url: "/api/experimental/jobs/" + job, request_sha256: requestSha }, 202);
    await expect(postAnalysis("/x", harness([receipt, () => json({ status: "error", request_sha256: requestSha, error: { code: "SECOND_ORDER_BEYOND_CRITICAL", message: "Além da carga crítica." } }, 422)]).options)).rejects.toThrow("SECOND_ORDER_BEYOND_CRITICAL");
    await expect(postAnalysis("/x", harness([() => json({ job, status_url: "/api/experimental/jobs/" + job, request_sha256: "0".repeat(64) }, 202)]).options)).rejects.toThrow("JOB_RECEIPT_MISMATCH");
    await expect(postAnalysis("/x", harness([receipt, () => json({ status: "error", error: { code: "JOB_NOT_FOUND", message: "Análise inexistente ou expirada." } }, 404)]).options)).rejects.toThrow("JOB_NOT_FOUND");
    const slow = harness([receipt, () => json({ status: "running", request_sha256: requestSha }, 202, { "Retry-After": "5" }), () => json({ status: "running", request_sha256: requestSha }, 202, { "Retry-After": "5" })]);
    await expect(postAnalysis("/x", { ...slow.options, maxWaitMs: 6000 })).rejects.toThrow(/JOB_WAIT_EXCEEDED: .*run_1.*continua na fila/);
  });

  it("cancelamento pelo usuário interrompe a consulta; 503 transitório é repetido e depois reportado", async () => {
    const requestSha = await sha(body), job = "run_2." + requestSha + "." + "f".repeat(64), receipt = () => json({ job, status_url: "/api/experimental/jobs/" + job, request_sha256: requestSha }, 202);
    const controller = new AbortController(), h = harness([receipt]); controller.abort();
    await expect(postAnalysis("/x", { ...h.options, signal: controller.signal })).rejects.toThrow();
    const flaky = harness([receipt, ...Array.from({ length: 6 }, () => () => json({ status: "error", error: { code: "UNAVAILABLE", message: "Não foi possível consultar a fila." } }, 503, { "Retry-After": "1" }))]);
    await expect(postAnalysis("/x", flaky.options)).rejects.toThrow("UNAVAILABLE");
  });
});
