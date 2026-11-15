import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptySnapshot, type Project } from "@/domain/models";
import { showcaseProject } from "@/domain/showcase-projects";
import { migrateLocalProjects, projectPayloadSha256 } from "@/domain/server-projects";
import { FileProjectStore } from "@/infrastructure/persistence/file-project-store";
import { HttpProjectStore } from "./http-project-store";
import { getProject, listProjects, saveProject, useProjectStore } from "./projects-http";
import { GET as listRoute } from "@/app/api/projects/route";

const origin = "https://jpn.example.invalid", password = "synthetic-operator-password-0123", token = "synthetic-engine-token-abcdef";
const numbers = (v: unknown, p = ""): [string, number][] => typeof v === "number" ? [[p, v]] : Array.isArray(v) ? v.flatMap((x, i) => numbers(x, `${p}[${i}]`))
  : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => numbers(x, `${p}.${k}`)) : [];
let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "jpn-projects-"));
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("JPN_MIXED_REMOTE_ENABLED", "1"); vi.stubEnv("JPN_MIXED_APP_ORIGIN", origin);
  vi.stubEnv("JPN_ANALYSIS_TOKEN", token); vi.stubEnv("JPN_MIXED_ACCESS_USER", "operator"); vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD", password);
  vi.stubEnv("JPN_PROJECTS_DIR", dir); useProjectStore(null);
});
afterEach(async () => { vi.unstubAllEnvs(); useProjectStore(null); await rm(dir, { recursive: true, force: true }); });

const auth = { Authorization: `Basic ${Buffer.from("operator:" + password).toString("base64")}` };
const req = (url: string, init: RequestInit = {}, authed = true) => new Request(origin + url, { ...init, headers: { origin, host: new URL(origin).host, "Content-Type": "application/json", ...(authed ? auth : {}), ...(init.headers ?? {}) } });
const put = (p: Project, expectedVersion: number, authed = true) => saveProject(req("/api/projects/" + p.id, { method: "PUT", body: JSON.stringify({ project: p, expectedVersion, snapshotVersion: 4 }) }, authed), p.id);

describe("armazenamento em arquivos (operador único, sem serviço externo)", () => {
  it("migra os projetos locais idênticos: arquivos em disco com o mesmo JSON, hash e todos os números bit a bit; um arquivo por versão", async () => {
    const store = new FileProjectStore(dir), snapshot = { ...emptySnapshot(), projects: [showcaseProject("cobertura"), showcaseProject("galpao")] }, before = structuredClone(snapshot);
    const report = await migrateLocalProjects(store, "operator:operator", snapshot);
    expect(report.migrated).toHaveLength(2); expect(snapshot).toEqual(before);
    for (const original of before.projects) {
      const row = await store.get("operator:operator", original.id);
      expect(row.version).toBe(1); expect(row.payload).toEqual(original); expect(JSON.stringify(row.payload)).toBe(JSON.stringify(original));
      expect(row.payloadSha256).toBe(await projectPayloadSha256(original));
      const a = numbers(original), b = numbers(row.payload); expect(b.length).toBe(a.length);
      a.forEach(([, v], i) => expect(Object.is(b[i][1], v)).toBe(true));
    }
    const again = await migrateLocalProjects(store, "operator:operator", snapshot);
    expect(again.migrated).toEqual([]); expect(again.skipped).toHaveLength(2);
  });

  it("versões, conflito e concorrência: duas gravações da mesma versão esperada nunca vencem juntas; versão gravada nunca é reescrita", async () => {
    const store = new FileProjectStore(dir), p = showcaseProject("galpao"), owner = "operator:operator";
    await store.save(owner, p, 0, 4);
    const results = await Promise.allSettled([store.save(owner, { ...p, name: "A" }, 1, 4), store.save(owner, { ...p, name: "B" }, 1, 4)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected").map(r => (r as PromiseRejectedResult).reason.message)).toEqual([expect.stringContaining("VERSION_CONFLICT")]);
    const history = await store.history(owner, p.id); expect(history.map(h => h.version)).toEqual([1, 2]);
    await expect(store.save(owner, p, 1, 4)).rejects.toThrow("VERSION_CONFLICT");
    expect((await store.list("operator:outro")).length).toBe(0);
    await expect(store.get("operator:outro", p.id)).rejects.toThrow("NOT_FOUND");
  });

  it("segurança: identificador de projeto não escapa da pasta; conteúdo adulterado em disco é detectado na leitura", async () => {
    const store = new FileProjectStore(dir), p = showcaseProject("cobertura"), owner = "operator:operator";
    await expect(store.get(owner, "../../etc/passwd")).rejects.toThrow("NOT_FOUND");
    await expect(store.save(owner, { ...p, id: "a/../b" }, 0, 4)).rejects.toThrow();
    await store.save(owner, p, 0, 4);
    const [ownerFolder] = await readdir(dir), file = path.join(dir, ownerFolder, p.id, "v000001.json");
    const record = JSON.parse(await readFile(file, "utf8")); record.payload.name = "adulterado"; await writeFile(file, JSON.stringify(record));
    await expect(store.get(owner, p.id)).rejects.toThrow("HASH_MISMATCH");
  });
});

describe("API /api/projects (operador único)", () => {
  it("exige o operador: sem credencial 401, com credencial grava, lista e lê; conflito 409; id divergente e projeto inválido 400", async () => {
    const p = showcaseProject("galpao");
    expect((await put(p, 0, false)).status).toBe(401);
    expect((await listProjects(req("/api/projects", {}, false))).status).toBe(401);
    expect((await listRoute(req("/api/projects", {}, false))).status).toBe(401);
    const saved = await put(p, 0); expect(saved.status).toBe(200);
    const body = await saved.json(); expect(body.record).toMatchObject({ projectId: p.id, version: 1, payloadSha256: await projectPayloadSha256(p) }); expect(body.record.ownerId).toBeUndefined();
    const conflict = await put({ ...p, name: "x" }, 0); expect(conflict.status).toBe(409); expect((await conflict.json()).error.code).toBe("VERSION_CONFLICT");
    expect((await put({ ...p, name: "v2" }, 1)).status).toBe(200);
    const list = await (await listProjects(req("/api/projects"))).json(); expect(list.projects).toEqual([expect.objectContaining({ projectId: p.id, version: 2, name: "v2" })]);
    const v1 = await (await getProject(req(`/api/projects/${p.id}?version=1`), p.id)).json(); expect(v1.record.payload).toEqual(p);
    expect((await getProject(req("/api/projects/nao-existe"), "nao-existe")).status).toBe(404);
    expect((await getProject(req("/api/projects/..%2Fx"), "../x")).status).toBe(404);
    const mismatch = await saveProject(req("/api/projects/outro", { method: "PUT", body: JSON.stringify({ project: p, expectedVersion: 0, snapshotVersion: 4 }) }), "outro"); expect(mismatch.status).toBe(400);
    const invalid = await saveProject(req("/api/projects/" + p.id, { method: "PUT", body: JSON.stringify({ project: { id: p.id }, expectedVersion: 0, snapshotVersion: 4 }) }), p.id); expect(invalid.status).toBe(400);
    expect((await saveProject(req("/api/projects/" + p.id, { method: "PUT", body: "{" }), p.id)).status).toBe(400);
  });

  it("cliente HTTP do navegador: migração pela API mantém dados e números idênticos e fica idempotente", async () => {
    const fetcher = (async (url: string, init?: RequestInit) => {
      const u = new URL(url, origin), parts = u.pathname.split("/").filter(Boolean);
      const request = req(u.pathname + u.search, init);
      if (parts.length === 2) return listProjects(request);
      return init?.method === "PUT" ? saveProject(request, parts[2]) : getProject(request, parts[2]);
    }) as typeof fetch;
    const store = new HttpProjectStore("/api/projects", fetcher), snapshot = { ...emptySnapshot(), projects: [showcaseProject("cobertura"), showcaseProject("galpao")] };
    const report = await migrateLocalProjects(store, "operator", snapshot);
    expect(report.migrated).toHaveLength(2);
    for (const original of snapshot.projects) {
      const row = await store.get("", original.id);
      expect(row.payload).toEqual(original); expect(row.payloadSha256).toBe(await projectPayloadSha256(original));
      const a = numbers(original), b = numbers(row.payload); a.forEach(([, v], i) => expect(Object.is(b[i][1], v)).toBe(true));
    }
    expect((await migrateLocalProjects(store, "operator", snapshot)).migrated).toEqual([]);
    expect((await store.history("", snapshot.projects[0].id))).toHaveLength(1);
  });
});
