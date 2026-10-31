import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: fake.spawn }));
import { localMixedLimits, runLocalMixed } from "./local-mixed-runner";
type Child = EventEmitter & { pid?: number; stdin: EventEmitter & { end: ReturnType<typeof vi.fn> }; stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
let child: Child;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1"); vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000");
  const gate = (globalThis as typeof globalThis & { __jpnLocalMixedGate: { active: number; disabled: boolean } }).__jpnLocalMixedGate; gate.active = 0; gate.disabled = false;
  child = Object.assign(new EventEmitter(), { pid: 123, stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
  fake.spawn.mockReturnValue(child);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); fake.spawn.mockReset(); });
it("timeout mata processo, mantém exclusão até close e só então libera vaga", async () => {
  const pending = runLocalMixed("", "health"); const observed = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(localMixedLimits.milliseconds); expect(child.kill).toHaveBeenCalledOnce();
  await expect(runLocalMixed("", "health")).rejects.toMatchObject({ code: "BUSY" });
  child.emit("close", null); await observed;
  expect((globalThis as typeof globalThis & { __jpnLocalMixedGate: { active: number } }).__jpnLocalMixedGate.active).toBe(0);
});
it("cancelamento aguarda confirmação de saída, sem publicar resultado", async () => {
  const controller = new AbortController(), pending = runLocalMixed("", "health", controller.signal), observed = expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  controller.abort(); expect(child.kill).toHaveBeenCalledOnce(); child.emit("close", null); await observed;
});
it.each(["stdout", "stderr"] as const)("limita %s e encerra o worker", async stream => {
  const pending = runLocalMixed("", "health"), observed = expect(pending).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  child[stream].emit("data", Buffer.alloc(stream === "stdout" ? localMixedLimits.outputBytes + 1 : 16001));
  expect(child.kill).toHaveBeenCalledOnce(); child.emit("close", null); await observed;
});
it("falha de limpeza bloqueia novas execuções mesmo depois de liberar contador", async () => {
  const pending = runLocalMixed("", "health"), observed = expect(pending).rejects.toMatchObject({ code: "CLEANUP_FAILURE" });
  await vi.advanceTimersByTimeAsync(localMixedLimits.milliseconds + 1500); await observed;
  await expect(runLocalMixed("", "health")).rejects.toMatchObject({ code: "CLEANUP_FAILURE" });
});
it("erro em processo iniciado não libera vaga antes do encerramento", async () => {
  const pending = runLocalMixed("", "health"), observed = expect(pending).rejects.toMatchObject({ code: "SERVICE_FAILURE" });
  child.emit("error", new Error("IO")); await expect(runLocalMixed("", "health")).rejects.toMatchObject({ code: "BUSY" });
  child.emit("close", 1); await observed;
});
