// Actual OS process termination, independently of numerical solver references.
import { afterEach, expect, it, vi } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
const state = vi.hoisted(() => ({ children: [] as ChildProcessWithoutNullStreams[] }));
vi.mock("node:child_process", async importOriginal => {
  const native = await importOriginal<typeof import("node:child_process")>();
  return { ...native, spawn: (executable: string, _args: string[], options: object) => {
    // A real long-running Python workload, not a fake numeric result.
    const child = native.spawn(executable, ["-I", "-c", "import time;print('started',flush=True);time.sleep(60)"], options) as ChildProcessWithoutNullStreams;
    state.children.push(child); return child;
  } };
});
import { runLocalMixed, localMixedLimits } from "./local-mixed-runner";
function enable() { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1"); vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000"); }
afterEach(() => { state.children.forEach(c => { if (c.exitCode === null && c.signalCode === null) c.kill(); }); state.children.length = 0; vi.useRealTimers(); vi.unstubAllEnvs(); });
it("o deadline efetivamente encerra processo Python do SO antes de liberar a vaga", async () => {
  enable(); const started = performance.now(), pending = runLocalMixed("", "health"), observed = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  const child = state.children[0]; await new Promise<void>(resolve => child.stdout.once("data", () => resolve()));
  expect(child.pid).toBeGreaterThan(0); await observed;
  expect(performance.now() - started).toBeGreaterThanOrEqual(localMixedLimits.milliseconds - 100);
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
}, 30000);
it("cancelar a consulta também encerra um processo Python real", async () => {
  enable(); const controller = new AbortController(), pending = runLocalMixed("", "health", controller.signal), observed = expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  const child = state.children[0]; await new Promise<void>(resolve => child.stdout.once("data", () => resolve()));
  controller.abort(); await observed; expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});
