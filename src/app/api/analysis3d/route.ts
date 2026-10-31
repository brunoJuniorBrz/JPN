import { spatialRequestSchema } from "@/domain/spatial-analysis";
import { runSpatialAnalysis } from "@/infrastructure/analysis/spatial-runner";
import { SolverFailure } from "@/infrastructure/analysis/runner";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let same = false;
    try { const target = new URL(request.url); target.host = request.headers.get("host") ?? target.host; const protocol = request.headers.get("x-forwarded-proto"); if (["http", "https"].includes(protocol ?? "")) target.protocol = `${protocol}:`; same = new URL(origin).origin === target.origin; } catch {}
    if (!same) return Response.json({ error: { code: "ORIGIN", message: "Origem não permitida." } }, { status: 403 });
  }
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("Sem corpo");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 500000) { await reader.cancel(); return Response.json({ error: { code: "INPUT_LIMIT", message: "Modelo excede 500 kB." } }, { status: 413 }); } chunks.push(chunk.value); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return Response.json({ error: { code: "INVALID_INPUT", message: "JSON 3D inválido." } }, { status: 422 }); }
    const parsed = spatialRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: { code: "INVALID_INPUT", message: "Dados 3D incompletos ou incompatíveis com o contrato SI; confira propriedades, referências, apoios, liberações e combinações." } }, { status: 422 });
    return Response.json(await runSpatialAnalysis(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e instanceof SolverFailure ? e.code : "INVALID_INPUT";
    return Response.json({ error: { code, message: e instanceof SolverFailure ? e.message : "Modelo 3D incompleto ou inválido." } }, { status: ["BUSY", "UNAVAILABLE", "TIMEOUT", "SERVICE_FAILURE"].includes(code) ? 503 : 422 });
  }
}
