import { localMixedEnabled, localMixedLimits, runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { SolverFailure } from "@/infrastructure/analysis/runner";

export const runtime = "nodejs";
function permitted(request: Request, post = false) {
  if (!localMixedEnabled()) return false;
  const expected = process.env.JPN_LOCAL_MIXED_ORIGIN!;
  try {
    const url = new URL(request.url), origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    // Next's custom-server Request URL may use localhost internally. The
    // launcher checks the actual socket and Host before invoking this handler.
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === new URL(expected).port && request.headers.get("host") === new URL(expected).host
      && (!post || origin === expected) && (!origin || origin === expected) && (!site || ["same-origin", "none"].includes(site));
  } catch { return false; }
}
function failure(e: unknown) {
  const error = e instanceof SolverFailure ? e : new SolverFailure("INVALID_INPUT", "Requisição experimental inválida.");
  return Response.json({ error: { code: error.code, message: error.message } }, { status: ["BUSY", "UNAVAILABLE", "TIMEOUT", "MEMORY_LIMIT", "MEMORY_LIMIT_UNAVAILABLE", "CLEANUP_FAILURE", "CANCELLED"].includes(error.code) ? 503 : error.code === "INPUT_LIMIT" ? 413 : 422, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: Request) {
  if (!permitted(request)) return Response.json({ error: { code: "LOCAL_ONLY", message: "Disponível somente pelo comando pnpm dev:structural no computador local." } }, { status: 403 });
  try { return Response.json(await runLocalMixed("", "health", request.signal), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!permitted(request, true)) return Response.json({ error: { code: "LOCAL_ONLY", message: "Origem local de desenvolvimento exigida." } }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(new SolverFailure("INVALID_INPUT", "Envie JSON pelo formulário local."));
  try {
    const reader = request.body?.getReader(); if (!reader) throw new SolverFailure("INVALID_INPUT", "Corpo ausente.");
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > localMixedLimits.inputBytes) { await reader.cancel(); throw new SolverFailure("INPUT_LIMIT", "Entrada excede 500 kB."); } chunks.push(part.value); }
    return Response.json(await runLocalMixed(Buffer.concat(chunks).toString("utf8"), "analysis", request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
