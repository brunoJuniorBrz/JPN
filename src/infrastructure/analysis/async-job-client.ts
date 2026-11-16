/** INT-2: browser client of the durable analysis queue (`POST ... Prefer: respond-async` -> 202 receipt -> poll -> result).
 * Same-origin only. Nothing is silent: every wait is reported through `onProgress`, every failure is an Error with the server code,
 * and an overlong wait ends with JOB_WAIT_EXCEEDED naming the job (the run keeps going on the server; it can be polled again).
 * The receipt must carry the SHA-256 of the exact body that was sent; the delivered result keeps its own `input_sha256`,
 * which the caller verifies against the request exactly as for a synchronous response. */
export type JobState = "pending" | "running" | "ready";
export type JobProgress = { state: JobState; job: string; polls: number; elapsedMs: number };
export type PostOptions = {
  body: string; headers?: Record<string, string>; signal: AbortSignal; onProgress?: (progress: JobProgress) => void;
  initialTimeoutMs?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number; fetcher?: typeof fetch; sha256?: (text: string) => Promise<string>;
};
export type PostResult = { out: unknown; requestSha256: string | null; viaJob: boolean; job: string | null };

const failure = (code: string, message: string) => new Error(`${code}: ${message}`);
async function errorOf(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  return failure(body.error?.code ?? String(response.status), body.error?.message ?? "Análise recusada.");
}
export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export async function postAnalysis(url: string, o: PostOptions): Promise<PostResult> {
  const doFetch = o.fetcher ?? fetch, sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms))), now = o.now ?? Date.now, hash = o.sha256 ?? sha256Hex;
  // The initial leg (the synchronous answer or the 202 receipt) keeps the old 33 s bound; the wait for a queued job does not.
  const first = new AbortController(), forward = () => first.abort(), timer = setTimeout(() => first.abort(), o.initialTimeoutMs ?? 33000);
  o.signal.addEventListener("abort", forward, { once: true });
  let response: Response;
  try {
    response = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "respond-async", ...(o.headers ?? {}) }, body: o.body, signal: first.signal });
  } catch (cause) {
    if (o.signal.aborted) throw cause;
    throw failure("TIMEOUT", "O servidor não respondeu em 33 s e a análise não foi aceita na fila.");
  } finally { clearTimeout(timer); o.signal.removeEventListener("abort", forward); }
  if (response.status !== 202) {
    if (!response.ok) throw await errorOf(response);
    return { out: await response.json(), requestSha256: response.headers.get("X-JPN-Request-Sha256"), viaJob: false, job: null };
  }
  const receipt = await response.json() as { job?: string; status_url?: string; request_sha256?: string };
  if (!receipt.job || !receipt.status_url?.startsWith("/api/experimental/jobs/") || !receipt.request_sha256) throw failure("JOB_RECEIPT", "Recibo da fila incompleto.");
  if (receipt.request_sha256 !== await hash(o.body)) throw failure("JOB_RECEIPT_MISMATCH", "O recibo da fila não corresponde ao corpo enviado.");
  const started = now(), limit = o.maxWaitMs ?? 30 * 60_000;
  let polls = 0, unavailable = 0, wait = clamp(Number(response.headers.get("Retry-After") ?? 2) * 1000 || 2000, 1000, 10_000);
  for (;;) {
    if (o.signal.aborted) throw new DOMException("Execução cancelada.", "AbortError");
    if (now() - started > limit) throw failure("JOB_WAIT_EXCEEDED", `A análise ${receipt.job} continua na fila após ${Math.round(limit / 60000)} min; ela segue no servidor e pode ser consultada de novo.`);
    await sleep(wait);
    if (o.signal.aborted) throw new DOMException("Execução cancelada.", "AbortError");
    polls++;
    const poll = await doFetch(receipt.status_url, { method: "GET", headers: { Accept: "application/json" }, signal: o.signal });
    if (poll.status === 503) { if (++unavailable > 5) throw await errorOf(poll); wait = clamp(Number(poll.headers.get("Retry-After") ?? 2) * 1000, 1000, 10_000); continue; }
    unavailable = 0;
    const body = await poll.json().catch(() => ({})) as { status?: string; result_url?: string; error?: { code?: string; message?: string }; request_sha256?: string };
    if (body.request_sha256 && body.request_sha256 !== receipt.request_sha256) throw failure("JOB_RECEIPT_MISMATCH", "A fila respondeu por outra entrada.");
    if (poll.status === 202 && (body.status === "pending" || body.status === "running")) {
      o.onProgress?.({ state: body.status, job: receipt.job, polls, elapsedMs: now() - started });
      wait = clamp(Number(poll.headers.get("Retry-After") ?? 2) * 1000 || 2000, 1000, 10_000); continue;
    }
    if (!poll.ok) throw failure(body.error?.code ?? String(poll.status), body.error?.message ?? "Análise recusada pela fila.");
    if (body.status !== "ready" || !body.result_url?.startsWith("/api/experimental/jobs/")) throw failure("JOB_STATE", "Estado desconhecido da fila.");
    o.onProgress?.({ state: "ready", job: receipt.job, polls, elapsedMs: now() - started });
    const result = await doFetch(body.result_url, { method: "GET", headers: { Accept: "application/json" }, signal: o.signal });
    if (!result.ok) throw await errorOf(result);
    const sha = result.headers.get("X-JPN-Request-Sha256");
    if (sha && sha !== receipt.request_sha256) throw failure("JOB_RECEIPT_MISMATCH", "O resultado pertence a outra entrada.");
    return { out: await result.json(), requestSha256: sha ?? receipt.request_sha256, viaJob: true, job: receipt.job };
  }
}
