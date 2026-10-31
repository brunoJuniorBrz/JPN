import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { canonicalSpatialInput, spatialRequestSchema, spatialResultSchema, type SpatialRequest } from "@/domain/spatial-analysis";
import { SolverFailure } from "./runner";

let active = 0;
const outputLimit = 2_000_000;
export async function runSpatialAnalysis(input: SpatialRequest) {
  const request = spatialRequestSchema.parse(input), payload = JSON.stringify(request);
  if (Buffer.byteLength(payload) > 500000) throw new SolverFailure("INPUT_LIMIT", "Modelo excede 500 kB.");
  if (active >= 2) throw new SolverFailure("BUSY", "Duas análises 3D já estão em execução.");
  active++;
  try {
    let raw: unknown;
    if (process.env.JPN_SPATIAL_ANALYSIS_URL) {
      const url = new URL(process.env.JPN_SPATIAL_ANALYSIS_URL);
      if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password) throw new SolverFailure("CONFIGURATION", "Serviço 3D requer HTTPS ou loopback, sem credenciais na URL.");
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.JPN_ANALYSIS_TOKEN ? { Authorization: `Bearer ${process.env.JPN_ANALYSIS_TOKEN}` } : {}) }, body: payload, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
      const reader = response.body?.getReader();
      if (!reader) throw new SolverFailure("INVALID_RESPONSE", "Resposta 3D vazia.");
      const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > outputLimit) { await reader.cancel(); throw new SolverFailure("OUTPUT_LIMIT", "Resposta 3D excede 2 MB."); } chunks.push(chunk.value); }
      const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!response.ok) throw new SolverFailure(envelope.error?.code ?? "SERVICE_FAILURE", envelope.error?.message ?? "Serviço recusou o modelo 3D.");
      if (envelope.request_sha256 !== createHash("sha256").update(payload).digest("hex")) throw new SolverFailure("INVALID_RESPONSE", "Resposta 3D não corresponde ao corpo enviado.");
      raw = envelope.result;
    } else {
      if (process.env.VERCEL) throw new SolverFailure("UNAVAILABLE", "Serviço de análise indisponível. Configure JPN_SPATIAL_ANALYSIS_URL; o modelo visual continua disponível.");
      const portable = path.resolve(".tools/python/python.exe");
      const executable = process.env.JPN_PYTHON_EXECUTABLE || (existsSync(portable) ? portable : path.resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"));
      raw = await new Promise<unknown>((resolve, reject) => {
        const child = spawn(executable, ["-m", "jpn_structural.frame3d"], { cwd: process.cwd(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1" } });
        const chunks: Buffer[] = []; let bytes = 0, settled = false;
        const fail = (code: string, message: string) => { if (!settled) { settled = true; clearTimeout(timer); child.kill(); reject(new SolverFailure(code, message)); } };
        const timer = setTimeout(() => fail("TIMEOUT", "Análise 3D excedeu 20 segundos; processo interrompido."), 20000);
        child.on("error", () => fail("UNAVAILABLE", "Python 3.12 com PyNiteFEA 3.2.1 indisponível."));
        child.stdin.on("error", () => fail("SERVICE_FAILURE", "Falha ao enviar modelo ao processo 3D."));
        child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > outputLimit) fail("OUTPUT_LIMIT", "Resposta 3D excede 2 MB."); else chunks.push(chunk); });
        child.stderr.on("data", () => {});
        child.on("close", code => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          try { const result = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (code !== 0 || result.status === "error") reject(new SolverFailure(result.error?.code ?? "SERVICE_FAILURE", result.error?.message ?? "Modelo 3D recusado.")); else resolve(result); }
          catch { reject(new SolverFailure("INVALID_RESPONSE", "Resposta inválida do processo 3D.")); }
        });
        child.stdin.end(payload);
      });
    }
    const parsed = spatialResultSchema.safeParse(raw);
    if (!parsed.success) throw new SolverFailure("INVALID_RESPONSE", "Resposta fora do contrato 3D, não finita ou com diagnóstico inválido.");
    const result = parsed.data, hash = createHash("sha256").update(canonicalSpatialInput(request)).digest("hex");
    const equalIds = (actual: string[], expected: string[]) => actual.sort().join("|") === expected.sort().join("|");
    if (result.input_sha256 !== hash || JSON.stringify(result.project) !== JSON.stringify(request.project) || !equalIds(Object.keys(result.combinations), request.combinations.map(c => c.id))) throw new SolverFailure("INVALID_RESPONSE", "Hash, revisão ou combinações da resposta 3D não correspondem ao modelo.");
    for (const combo of Object.values(result.combinations)) if (!equalIds(Object.keys(combo.nodes), request.nodes.map(n => n.id)) || !equalIds(Object.keys(combo.members), request.members.map(m => m.id))) throw new SolverFailure("INVALID_RESPONSE", "IDs da resposta 3D não correspondem ao modelo.");
    return result;
  } catch (e) {
    if (e instanceof SolverFailure) throw e;
    if (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name)) throw new SolverFailure("TIMEOUT", "Serviço 3D excedeu o tempo disponível; nenhum resultado publicado.");
    throw new SolverFailure("SERVICE_FAILURE", "Falha ao consultar o motor 3D; confira serviço e entradas.");
  } finally { active--; }
}
