import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { trussRequestSchema, trussResultSchema, type TrussRequest } from "@/domain/analysis";

export class SolverFailure extends Error { constructor(public code: string, message: string) { super(message); } }
let active = 0;
export async function runAnalysis(input: TrussRequest) {
  const request = trussRequestSchema.parse(input), payload = JSON.stringify(request);
  if (active >= 2) throw new SolverFailure("BUSY", "Duas análises já estão em execução. Aguarde e tente novamente.");
  active++;
  try {
    let raw: unknown;
    if (process.env.JPN_ANALYSIS_URL) {
      const url = new URL(process.env.JPN_ANALYSIS_URL);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new SolverFailure("CONFIGURATION", "Serviço remoto deve usar HTTPS.");
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.JPN_ANALYSIS_TOKEN ? { Authorization: `Bearer ${process.env.JPN_ANALYSIS_TOKEN}` } : {}) }, body: payload, signal: AbortSignal.timeout(20000), cache: "no-store", redirect: "error" });
      const reader = response.body?.getReader(), decoder = new TextDecoder();
      let text = "", received = 0;
      if (!reader) throw new SolverFailure("INVALID_RESPONSE", "Resposta vazia do solver.");
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > 1_000_000) { await reader.cancel(); throw new SolverFailure("INVALID_RESPONSE", "Resposta do solver excede o limite."); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const envelope = JSON.parse(text);
      if (!response.ok) throw new SolverFailure(envelope.error?.code ?? "SERVICE_FAILURE", envelope.error?.message ?? "O serviço recusou a análise.");
      if (envelope.request_sha256 !== createHash("sha256").update(payload).digest("hex")) throw new SolverFailure("INVALID_RESPONSE", "Resposta não corresponde às entradas enviadas.");
      raw = envelope.result;
    } else {
      if (process.env.VERCEL) throw new SolverFailure("UNAVAILABLE", "Análise indisponível nesta implantação. Configure o serviço Python separado; levantamento e orçamento continuam disponíveis.");
      const portable = path.resolve(".tools/python/python.exe");
      const executable = process.env.JPN_PYTHON_EXECUTABLE || (existsSync(portable) ? portable : process.platform === "win32" ? path.resolve(".venv/Scripts/python.exe") : path.resolve(".venv/bin/python"));
      raw = await new Promise<unknown>((resolve, reject) => {
        const child = spawn(executable, ["-m", "jpn_structural"], { cwd: process.cwd(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        let output = "", settled = false;
        const fail = (code: string, message: string) => { if (!settled) { settled = true; clearTimeout(timer); child.kill(); reject(new SolverFailure(code, message)); } };
        const timer = setTimeout(() => fail("TIMEOUT", "Análise excedeu 20 segundos; nenhum resultado foi publicado."), 20000);
        child.on("error", () => fail("UNAVAILABLE", "Python indisponível. Configure JPN_PYTHON_EXECUTABLE ou o serviço de análise."));
        child.stdin.on("error", () => fail("SERVICE_FAILURE", "Falha ao enviar os dados ao solver."));
        child.stdout.on("data", bytes => { output += bytes.toString("utf8"); if (output.length > 1_000_000) fail("INVALID_RESPONSE", "Resposta do solver excede o limite."); });
        child.stderr.on("data", () => {});
        child.on("close", code => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          try { const data = JSON.parse(output); if (code !== 0 || data.status === "error") reject(new SolverFailure(data.error?.code ?? "SERVICE_FAILURE", data.error?.message ?? "Não foi possível resolver o modelo.")); else resolve(data); }
          catch { reject(new SolverFailure("INVALID_RESPONSE", "O solver não devolveu um resultado válido.")); }
        });
        child.stdin.end(payload);
      });
    }
    const result = trussResultSchema.parse(raw);
    if (Object.keys(result.nodes).sort().join("|") !== request.nodes.map(n => n.id).sort().join("|") || Object.keys(result.members).sort().join("|") !== request.members.map(m => m.id).sort().join("|")) throw new SolverFailure("INVALID_RESPONSE", "Nós ou barras da resposta não correspondem ao modelo.");
    return result;
  } finally { active--; }
}
