import { runAnalysis, SolverFailure } from "@/infrastructure/analysis/runner";
import { trussRequestSchema } from "@/domain/analysis";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      // Next may normalize request.url to localhost behind its HTTP listener.
      // Host remains the actual destination; browsers cannot forge that header.
      const destination = new URL(request.url); destination.host = request.headers.get("host") ?? destination.host;
      const protocol = request.headers.get("x-forwarded-proto");
      if (protocol === "http" || protocol === "https") destination.protocol = `${protocol}:`;
      sameOrigin = new URL(origin).origin === destination.origin;
    } catch { sameOrigin = false; }
    if (!sameOrigin) return Response.json({ error: { code: "ORIGIN", message: "Origem da solicitação não permitida." } }, { status: 403 });
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Sem dados.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 500000) { await reader.cancel(); return Response.json({ error: { code: "INPUT_LIMIT", message: "Modelo excede 500 kB." } }, { status: 413 }); } chunks.push(next.value); }
    const parsed = trussRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return Response.json({ error: { code: "INVALID_INPUT", message: "Modelo incompleto, não finito ou fora do contrato SI." } }, { status: 422 });
    return Response.json(await runAnalysis(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e instanceof SolverFailure ? e.code : "ANALYSIS_FAILURE";
    return Response.json({ error: { code, message: e instanceof SolverFailure ? e.message : "Falha de análise. Confira as entradas e a disponibilidade do serviço." } }, { status: ["UNAVAILABLE", "BUSY"].includes(code) ? 503 : 422 });
  }
}
