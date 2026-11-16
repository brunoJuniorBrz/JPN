import { expect, it } from "vitest";
import { postAnalysis, sha256Hex } from "./async-job-client";

it.each(["SECOND_ORDER_MESH_NOT_CONVERGED", "SECOND_ORDER_NOT_CONVERGED", "SECOND_ORDER_BEYOND_CRITICAL"])("keeps code and combination of queued refusal %s without publishing partial results", async code => {
  const body = "{}", sha = await sha256Hex(body);
  let calls = 0;
  const fetcher = (async () => ++calls === 1
    ? Response.json({ job: "j", request_sha256: sha, status_url: "/api/experimental/jobs/j" }, { status: 202 })
    : Response.json({ status: "error", error: { code, combination_id: "ELU-7", message: "Recusado" }, result: { combinations: { PARTIAL: {} } } }, { status: 422 })) as typeof fetch;
  await expect(postAnalysis("/api/experimental/mixed3d", { body, signal: new AbortController().signal, fetcher, sleep: async () => {} })).rejects.toThrow(`${code}: Combinação ELU-7: Recusado`);
  expect(calls).toBe(2);
});
