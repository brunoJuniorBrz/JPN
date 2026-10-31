import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { runSpatialAnalysis } from "./spatial-runner";
import { spatialRequestSchema } from "@/domain/spatial-analysis";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const request = () => spatialRequestSchema.parse(JSON.parse(readFileSync("engine/examples/spatial-portal.json", "utf8")));
function worker() {
  vi.stubEnv("JPN_SPATIAL_ANALYSIS_URL", ""); vi.stubEnv("VERCEL", "");
  const child = Object.assign(new EventEmitter(), { stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true) });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>); return child;
}
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("interrompe processo local após 20 s e não publica saída parcial", async () => {
  vi.useFakeTimers(); const child = worker(), task = runSpatialAnalysis(request());
  const check = expect(task).rejects.toMatchObject({ code: "TIMEOUT" });
  child.stdout.emit("data", Buffer.from('{"status":'));
  await vi.advanceTimersByTimeAsync(20001); await check; expect(child.kill).toHaveBeenCalledOnce();
});
it("limita stdout por bytes e mata worker que excede 2 MB", async () => {
  const child = worker(), task = runSpatialAnalysis(request()), check = expect(task).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  child.stdout.emit("data", Buffer.alloc(2_000_001)); await check; expect(child.kill).toHaveBeenCalledOnce();
});
it("recusa stdout inválido e libera o slot de concorrência", async () => {
  const child = worker(), task = runSpatialAnalysis(request()), check = expect(task).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  child.stdout.emit("data", Buffer.from("not JSON")); child.emit("close", 0); await check;
  const next = worker(), again = runSpatialAnalysis(request()), failure = expect(again).rejects.toMatchObject({ code: "SERVICE_FAILURE" });
  next.stdin.emit("error", new Error("broken pipe")); await failure; expect(next.kill).toHaveBeenCalledOnce();
});
