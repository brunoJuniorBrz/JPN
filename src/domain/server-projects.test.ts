import { describe, expect, it } from "vitest";
import { emptySnapshot, type Project } from "./models";
import { showcaseProject } from "./showcase-projects";
import { InMemoryProjectStore, ProjectStoreError, migrateLocalProjects, projectPayloadSha256, reconcileCache } from "./server-projects";

const numbers = (value: unknown, path = ""): [string, number][] =>
  typeof value === "number" ? [[path, value]] : Array.isArray(value) ? value.flatMap((v, i) => numbers(v, `${path}[${i}]`))
    : value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => numbers(v, `${path}.${k}`)) : [];
const localSnapshot = () => ({ ...emptySnapshot(), projects: [showcaseProject("cobertura"), showcaseProject("galpao")] });
const fixedClock = () => "2026-11-15T12:00:00.000Z";

describe("projetos no servidor: migração dos projetos locais sem alterar dados nem números", () => {
  it("cada projeto sobe idêntico: mesmo JSON, mesmo hash canônico (floats em bits) e todos os números iguais bit a bit, também após ida e volta pelo servidor", async () => {
    const snapshot = localSnapshot(), before = structuredClone(snapshot), store = new InMemoryProjectStore(fixedClock);
    const report = await migrateLocalProjects(store, "user-1", snapshot);
    expect(report.skipped).toEqual([]); expect(report.migrated).toHaveLength(2);
    expect(snapshot).toEqual(before);                                              // the local data was not touched
    for (const original of before.projects) {
      const row = await store.get("user-1", original.id);
      expect(row.version).toBe(1); expect(row.parentVersion).toBeNull(); expect(row.snapshotVersion).toBe(before.version);
      expect(row.payload).toEqual(original);
      expect(JSON.stringify(row.payload)).toBe(JSON.stringify(original));
      expect(row.payloadSha256).toBe(await projectPayloadSha256(original));
      const wire = JSON.parse(JSON.stringify(row)) as typeof row;                  // what an HTTP/DB round trip does
      expect(await projectPayloadSha256(wire.payload)).toBe(row.payloadSha256);
      const a = numbers(original), b = numbers(wire.payload);
      expect(b).toHaveLength(a.length); expect(a.length).toBeGreaterThan(20);
      a.forEach(([path, value], i) => { expect(b[i][0]).toBe(path); expect(Object.is(b[i][1], value)).toBe(true); });
    }
  });

  it("migração é idempotente e nunca sobrescreve: repetir não cria versão; conteúdo diferente no servidor é apenas reportado", async () => {
    const snapshot = localSnapshot(), store = new InMemoryProjectStore(fixedClock);
    await migrateLocalProjects(store, "user-1", snapshot);
    const again = await migrateLocalProjects(store, "user-1", snapshot);
    expect(again.migrated).toEqual([]); expect(again.skipped.map(s => s.reason)).toEqual(["já está no servidor, idêntico", "já está no servidor, idêntico"]);
    expect((await store.history("user-1", snapshot.projects[0].id))).toHaveLength(1);
    const edited: Project = { ...structuredClone(snapshot.projects[0]), name: "Editado em outro navegador" };
    const third = await migrateLocalProjects(store, "user-1", { ...snapshot, projects: [edited] });
    expect(third.migrated).toEqual([]); expect(third.skipped[0].reason).toContain("conteúdo diferente");
    expect((await store.get("user-1", edited.id)).payload.name).toBe(snapshot.projects[0].name);   // the server copy is untouched
  });

  it("versões por projeto: cada gravação anexa uma versão; versão desatualizada é VERSION_CONFLICT; histórico preserva todas; outro usuário não vê nem grava", async () => {
    const store = new InMemoryProjectStore(fixedClock), p = showcaseProject("galpao");
    const v1 = await store.save("user-1", p, 0, 4);
    const v2 = await store.save("user-1", { ...p, name: "v2" }, 1, 4);
    expect(v2.version).toBe(2); expect(v2.parentVersion).toBe(1);
    await expect(store.save("user-1", { ...p, name: "stale" }, 1, 4)).rejects.toThrow("VERSION_CONFLICT");
    expect((await store.history("user-1", p.id)).map(r => r.payload.name)).toEqual([v1.payload.name, "v2"]);
    expect((await store.get("user-1", p.id, 1)).payload.name).toBe(v1.payload.name);
    expect(await store.list("user-2")).toEqual([]);
    await expect(store.get("user-2", p.id)).rejects.toThrow(ProjectStoreError);
    await expect(store.save("user-2", p, 0, 4)).rejects.toThrow("FORBIDDEN");
    expect((await store.list("user-1"))[0].version).toBe(2);
  });

  it("cache local: servidor vence sem edição pendente; edição pendente sobre versão antiga é conflito explícito, nunca sobrescrita silenciosa", () => {
    const server = { version: 3, payloadSha256: "s3" };
    expect(reconcileCache({ cachedBaseVersion: 3, cachedSha256: "s3", cachedBaseSha256: "s3", server })).toBe("in-sync");
    expect(reconcileCache({ cachedBaseVersion: 3, cachedSha256: "edit", cachedBaseSha256: "s3", server })).toBe("push-local");
    expect(reconcileCache({ cachedBaseVersion: 2, cachedSha256: "s2", cachedBaseSha256: "s2", server })).toBe("use-server");
    expect(reconcileCache({ cachedBaseVersion: 2, cachedSha256: "edit", cachedBaseSha256: "s2", server })).toBe("conflict");
    expect(reconcileCache({ cachedBaseVersion: null, cachedSha256: "local", cachedBaseSha256: null, server })).toBe("conflict");
    expect(reconcileCache({ cachedBaseVersion: null, cachedSha256: "s3", cachedBaseSha256: null, server })).toBe("in-sync");
    expect(reconcileCache({ cachedBaseVersion: null, cachedSha256: "local", cachedBaseSha256: null, server: null })).toBe("push-local");
  });
});
