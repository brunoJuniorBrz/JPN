import { afterEach, beforeEach, expect, it, vi } from "vitest";

const calls: { fn: string; args: unknown[] }[] = [], files = new Map<string, string>();
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: string, options: Record<string, unknown>) => {
    calls.push({ fn: "put", args: [pathname, options] });
    if (files.has(pathname) && !options.allowOverwrite) throw new Error("This blob already exists, use allowOverwrite: true if you want to overwrite it");
    files.set(pathname, body); return { pathname };
  },
  list: async (options: { prefix: string; cursor?: string }) => {
    calls.push({ fn: "list", args: [options] });
    const all = [...files.keys()].filter(k => k.startsWith(options.prefix)).sort();
    const start = options.cursor ? Number(options.cursor) : 0, page = all.slice(start, start + 2);   // 2 per page: exercises pagination
    return { blobs: page.map(pathname => ({ pathname })), hasMore: start + 2 < all.length, cursor: String(start + 2) };
  },
  get: async (pathname: string, options: Record<string, unknown>) => {
    calls.push({ fn: "get", args: [pathname, options] });
    const text = files.get(pathname); return text === undefined ? null : { statusCode: 200, stream: new Response(text).body, headers: new Headers(), blob: {} };
  },
}));
import { vercelBlobPort } from "./blob-project-store";
import { getProject, listProjects, saveProject } from "@/infrastructure/projects/projects-http";
import { showcaseProject } from "@/domain/showcase-projects";

const origin = "https://jpn.example.invalid", password = "synthetic-operator-password-0123";
const req = (url: string, init: RequestInit = {}) => new Request(origin + url, { ...init, headers: { origin, host: new URL(origin).host, "Content-Type": "application/json", Authorization: `Basic ${Buffer.from("operator:" + password).toString("base64")}` } });
beforeEach(() => {
  calls.length = 0; files.clear();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("JPN_MIXED_REMOTE_ENABLED", "1"); vi.stubEnv("JPN_MIXED_APP_ORIGIN", origin);
  vi.stubEnv("JPN_ANALYSIS_TOKEN", "synthetic-engine-token-abcdef"); vi.stubEnv("JPN_MIXED_ACCESS_USER", "operator"); vi.stubEnv("JPN_MIXED_ACCESS_PASSWORD", password);
  vi.stubEnv("JPN_PROJECTS_BACKEND", ""); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

it("porta real do Blob: store privado, sem sobrescrita, sem sufixo aleatório, leitura sem cache e listagem paginada", async () => {
  const port = vercelBlobPort("tok");
  await port.putExclusive("projects/x/p/v000001.json", "{}");
  await expect(port.putExclusive("projects/x/p/v000001.json", "{}")).rejects.toThrow(/already exists/);
  for (const n of ["2", "3", "4"]) await port.putExclusive(`projects/x/p/v00000${n}.json`, "{}");
  expect(await port.list("projects/x/p/")).toHaveLength(4);
  expect(await port.getText("projects/x/p/v000001.json")).toBe("{}"); expect(await port.getText("projects/x/p/nao.json")).toBeNull();
  const put = calls.find(c => c.fn === "put")!.args[1] as Record<string, unknown>;
  expect(put).toMatchObject({ access: "private", allowOverwrite: false, addRandomSuffix: false, contentType: "application/json", token: "tok" });
  expect(calls.find(c => c.fn === "get")!.args[1]).toMatchObject({ access: "private", useCache: false, token: "tok" });
});

it("API em produção: sem BLOB_READ_WRITE_TOKEN recusa (503) em vez de usar disco efêmero; com o token grava, lista e lê pelo Blob; conflito 409", async () => {
  const p = showcaseProject("galpao"), put = (project: typeof p, expectedVersion: number) => saveProject(req("/api/projects/" + p.id, { method: "PUT", body: JSON.stringify({ project, expectedVersion, snapshotVersion: 4 }) }), p.id);
  const refused = await put(p, 0); expect(refused.status).toBe(503); expect((await refused.json()).error.code).toBe("PROJECTS_STORAGE_UNCONFIGURED");
  expect((await listProjects(req("/api/projects"))).status).toBe(503); expect(calls).toEqual([]);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_synthetic");
  expect((await put(p, 0)).status).toBe(200);
  expect((await put({ ...p, name: "stale" }, 0)).status).toBe(409);
  expect((await put({ ...p, name: "v2" }, 1)).status).toBe(200);
  const list = await (await listProjects(req("/api/projects"))).json(); expect(list.projects).toEqual([expect.objectContaining({ projectId: p.id, version: 2, name: "v2" })]);
  expect((await (await getProject(req(`/api/projects/${p.id}?version=1`), p.id)).json()).record.payload).toEqual(p);
  expect([...files.keys()].sort().map(k => k.replace(/^projects\/[a-f0-9]{24}\//, ""))).toEqual([`${p.id}/v000001.json`, `${p.id}/v000002.json`]);
  expect(calls.filter(c => c.fn === "put").every(c => (c.args[1] as { token: string }).token === "vercel_blob_rw_synthetic")).toBe(true);
});
