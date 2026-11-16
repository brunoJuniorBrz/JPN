import { describe, expect, it } from "vitest";
import { emptySnapshot } from "@/domain/models";
import { showcaseProject } from "@/domain/showcase-projects";
import { migrateLocalProjects, projectPayloadSha256 } from "@/domain/server-projects";
import { BlobProjectStore, type BlobPort } from "./blob-project-store";

/** In-memory object store with Vercel Blob semantics: exclusive create ("already exists"), prefix listing, text read. */
function fakeBlob() {
  const objects = new Map<string, string>(); let lag = false, stale: string[] = [];
  const port: BlobPort = {
    async putExclusive(pathname, body) { await Promise.resolve(); if (objects.has(pathname)) throw new Error("Vercel Blob: This blob already exists, use allowOverwrite: true if you want to overwrite it"); objects.set(pathname, body); },
    async list(prefix) { return lag ? stale.filter(p => p.startsWith(prefix)) : [...objects.keys()].filter(p => p.startsWith(prefix)); },
    async getText(pathname) { return objects.get(pathname) ?? null; },
  };
  return { port, objects, freezeListing() { lag = true; stale = [...objects.keys()]; } };
}
const numbers = (v: unknown, p = ""): [string, number][] => typeof v === "number" ? [[p, v]] : Array.isArray(v) ? v.flatMap((x, i) => numbers(x, `${p}[${i}]`))
  : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => numbers(x, `${p}.${k}`)) : [];
const OWNER = "operator:operator";

describe("armazenamento no Vercel Blob: mesmo contrato do arquivo", () => {
  it("migração idêntica: cada versão é um blob; JSON, hash e todos os números iguais bit a bit; repetir não cria versão", async () => {
    const { port, objects } = fakeBlob(), store = new BlobProjectStore(port), snapshot = { ...emptySnapshot(), projects: [showcaseProject("cobertura"), showcaseProject("galpao")] };
    const report = await migrateLocalProjects(store, OWNER, snapshot);
    expect(report.migrated).toHaveLength(2); expect(objects.size).toBe(2);
    expect([...objects.keys()].every(k => /^projects\/[a-f0-9]{24}\/[^/]+\/v000001\.json$/.test(k))).toBe(true);
    for (const original of snapshot.projects) {
      const row = await store.get(OWNER, original.id);
      expect(row.payload).toEqual(original); expect(JSON.stringify(row.payload)).toBe(JSON.stringify(original)); expect(row.payloadSha256).toBe(await projectPayloadSha256(original));
      const a = numbers(original), b = numbers(row.payload); a.forEach(([, v], i) => expect(Object.is(b[i][1], v)).toBe(true));
    }
    expect((await migrateLocalProjects(store, OWNER, snapshot)).migrated).toEqual([]); expect(objects.size).toBe(2);
  });

  it("versões imutáveis e conflito: gravações simultâneas da mesma versão têm um só vencedor; listagem atrasada não permite sobrescrever", async () => {
    const { port, objects, freezeListing } = fakeBlob(), store = new BlobProjectStore(port), p = showcaseProject("galpao");
    await store.save(OWNER, p, 0, 4);
    const raced = await Promise.allSettled([store.save(OWNER, { ...p, name: "A" }, 1, 4), store.save(OWNER, { ...p, name: "B" }, 1, 4)]);
    expect(raced.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((raced.find(r => r.status === "rejected") as PromiseRejectedResult).reason.message).toContain("VERSION_CONFLICT");
    expect((await store.history(OWNER, p.id)).map(h => h.version)).toEqual([1, 2]);
    const v2Key = [...objects.keys()].find(k => k.endsWith("v000002.json"))!, v2Before = objects.get(v2Key);
    freezeListing();   // the listing still shows v1/v2 after a third version appeared elsewhere: exclusive create must still refuse
    objects.set(v2Key.replace("v000002", "v000003"), "{}");
    await expect(store.save(OWNER, { ...p, name: "C" }, 2, 4)).rejects.toThrow("VERSION_CONFLICT");
    expect(objects.get(v2Key)).toBe(v2Before);   // v2 untouched
  });

  it("hash conferido na leitura, dono isolado e identificador seguro", async () => {
    const { port, objects } = fakeBlob(), store = new BlobProjectStore(port), p = showcaseProject("cobertura");
    await store.save(OWNER, p, 0, 4);
    expect(await store.list("operator:outro")).toEqual([]); await expect(store.get("operator:outro", p.id)).rejects.toThrow("NOT_FOUND");
    await expect(store.get(OWNER, "../../x")).rejects.toThrow("NOT_FOUND"); await expect(store.save(OWNER, { ...p, id: "a/../b" }, 0, 4)).rejects.toThrow();
    const key = [...objects.keys()][0], record = JSON.parse(objects.get(key)!); record.payload.name = "adulterado"; objects.set(key, JSON.stringify(record));
    await expect(store.get(OWNER, p.id)).rejects.toThrow("HASH_MISMATCH");
    await expect(store.list(OWNER)).rejects.toThrow("HASH_MISMATCH");
  });
});
