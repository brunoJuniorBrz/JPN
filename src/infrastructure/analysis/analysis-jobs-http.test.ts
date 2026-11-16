import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/experimental/mixed3d/route";
import { pollAnalysis } from "./analysis-jobs-http";

const runtime = vi.hoisted(() => ({ start: vi.fn(), getRun: vi.fn() }));
vi.mock("workflow/api", () => runtime);

const origin = "https://jpn.example.invalid";
const authorization = "Basic " + Buffer.from("operator:synthetic-password-for-tests").toString("base64");
const shed = JSON.parse(readFileSync("validation/int-3b/shed-int1c.json", "utf8"));
const payload = JSON.stringify({ ...shed, analysis_order: "second-order", solution_mode: "per-combination" });
const requestHash = createHash("sha256").update(payload).digest("hex");

beforeEach(() => {
  vi.stubEnv("JPN_MIXED_REMOTE_ENABLED", "1");
  vi.stubEnv("JPN_MIXED_APP_ORIGIN", origin);
  vi.stubEnv("JPN_MIXED_ACCESS_USER", "operator");
  vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD", "synthetic-password-for-tests");
  vi.stubEnv("JPN_ANALYSIS_ASYNC_ENABLED", "1");
  vi.stubEnv("JPN_ANALYSIS_JOB_KEY", "synthetic-private-key-32-characters-test");
  runtime.start.mockResolvedValue({ runId: "wrun_test" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

function submission(auth = authorization) {
  return POST(new Request(origin + "/api/experimental/mixed3d", {
    method: "POST", headers: { origin, host: new URL(origin).host, authorization: auth, "Content-Type": "application/json" },
    body: payload,
  }));
}
function poll(job: string, options: { result?: boolean; gzip?: boolean; auth?: string } = {}) {
  return pollAnalysis(new Request(origin + "/api/experimental/jobs/" + job + (options.result ? "?result=1" : ""), {
    headers: { host: new URL(origin).host, authorization: options.auth ?? authorization, ...(options.gzip ? { "Accept-Encoding": "gzip" } : {}) },
  }), job);
}

it("authenticates and enqueues the original bytes of the 42-combination shed", async () => {
  expect((await submission("")).status).toBe(401);
  expect(runtime.start).not.toHaveBeenCalled();
  expect(shed.combinations).toHaveLength(42);
  const response = await submission();
  expect(response.status).toBe(202);
  const receipt = await response.json();
  expect(receipt).toMatchObject({ status: "pending", request_sha256: requestHash });
  expect(response.headers.get("Location")).toBe(receipt.status_url);
  expect(runtime.start).toHaveBeenCalledWith(expect.any(Function), ["second-order", payload]);
  expect((await poll(receipt.job, { auth: "" })).status).toBe(401);
  expect((await poll(receipt.job.replace(requestHash, "0".repeat(64)))).status).toBe(404);
  expect(runtime.getRun).not.toHaveBeenCalled();
});

it("supports polling lifecycle, preserves bytes and reports terminal errors explicitly", async () => {
  const { job } = await (await submission()).json();
  for (const status of ["pending", "running"]) {
    runtime.getRun.mockReturnValue({ exists: true, status });
    const response = await poll(job);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ status, request_sha256: requestHash });
  }
  const raw = Buffer.from('{"result":{"computedStructuralApproval":false,"fabricationRelease":false,"releaseGate":"NOT_READY_BLOCKED"}}');
  const compressed = gzipSync(raw);
  runtime.getRun.mockReturnValue({ exists: true, status: "completed",
    returnValue: { status: "ready", body: compressed, jsonBytes: raw.length } });
  expect(await (await poll(job)).json()).toMatchObject({ status: "ready", result_url: expect.stringContaining("?result=1") });
  const result = await poll(job, { result: true });
  expect(result.headers.get("X-JPN-Request-Sha256")).toBe(requestHash);
  expect(Buffer.from(await result.arrayBuffer())).toEqual(raw);
  const gzipped = await poll(job, { result: true, gzip: true });
  expect(gzipped.headers.get("Content-Encoding")).toBe("gzip");
  expect(Buffer.from(await gzipped.arrayBuffer())).toEqual(compressed);
  const error = { status: "error", error: { code: "SECOND_ORDER_NOT_CONVERGED", combination_id: "U-N01" } };
  runtime.getRun.mockReturnValue({ exists: true, status: "completed", returnValue: error });
  const refused = await poll(job);
  expect(refused.status).toBe(422);
  expect(await refused.json()).toMatchObject(error);
  runtime.getRun.mockReturnValue({ exists: true, status: "failed" });
  expect(await (await poll(job)).json()).toMatchObject({ status: "error", error: { code: "WORKFLOW_FAILED" } });
});
