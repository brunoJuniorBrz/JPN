import type { Project, Snapshot } from "./models";
import { mixedInputHash } from "./mixed-analysis";

/** INT-2 / etapa 4 — projects saved on the server per user, versioned; localStorage becomes a cache.
 * Provider-agnostic: this file fixes the CONTRACT (record, store port, optimistic concurrency, local migration, cache reconciliation).
 * Which login provider and which database implement `ProjectStore` is an owner decision (docs/INT-2-CONTAS-E-PROJETOS.md).
 * A project is stored and returned as an opaque, immutable payload: the server never recomputes, rounds or reformats any number. */
export interface ServerProjectRecord {
  projectId: string; ownerId: string;
  /** 1, 2, 3 ... per project; every save creates a new version, nothing is overwritten. */
  version: number; parentVersion: number | null;
  savedAt: string;
  /** Canonical SHA-256 of `payload` (floats hashed bit-by-bit): the migration and every round trip are proven against it. */
  payloadSha256: string;
  /** Local snapshot format the project came from (models.ts `Snapshot.version`). */
  snapshotVersion: number;
  payload: Project;
}
export class ProjectStoreError extends Error {
  constructor(readonly code: "VERSION_CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "HASH_MISMATCH", message: string) { super(`${code}: ${message}`); }
}
export interface ProjectStore {
  list(ownerId: string): Promise<ServerProjectRecord[]>;                     // latest version of each project
  get(ownerId: string, projectId: string, version?: number): Promise<ServerProjectRecord>;
  history(ownerId: string, projectId: string): Promise<ServerProjectRecord[]>;
  /** Appends version `expectedVersion + 1` (0 for a new project). A stale expectedVersion is a VERSION_CONFLICT, never a silent overwrite. */
  save(ownerId: string, project: Project, expectedVersion: number, snapshotVersion: number): Promise<ServerProjectRecord>;
}

export const projectPayloadSha256 = (project: Project) => mixedInputHash(project);

/** Reference implementation of the contract (tests, local development). A real store must pass the same tests. */
export class InMemoryProjectStore implements ProjectStore {
  private rows: ServerProjectRecord[] = [];
  constructor(private clock: () => string = () => new Date().toISOString()) {}
  private versions(ownerId: string, projectId: string) { return this.rows.filter(r => r.ownerId === ownerId && r.projectId === projectId).sort((a, b) => a.version - b.version); }
  async list(ownerId: string) {
    const ids = [...new Set(this.rows.filter(r => r.ownerId === ownerId).map(r => r.projectId))];
    return ids.map(id => structuredClone(this.versions(ownerId, id).at(-1)!));
  }
  async get(ownerId: string, projectId: string, version?: number) {
    const all = this.versions(ownerId, projectId), row = version === undefined ? all.at(-1) : all.find(r => r.version === version);
    if (!row) throw new ProjectStoreError("NOT_FOUND", `projeto ${projectId}${version ? ` v${version}` : ""} inexistente para este usuário`);
    return structuredClone(row);
  }
  async history(ownerId: string, projectId: string) { return structuredClone(this.versions(ownerId, projectId)); }
  async save(ownerId: string, project: Project, expectedVersion: number, snapshotVersion: number) {
    if (!ownerId) throw new ProjectStoreError("FORBIDDEN", "usuário ausente");
    if (this.rows.some(r => r.projectId === project.id && r.ownerId !== ownerId)) throw new ProjectStoreError("FORBIDDEN", "projeto pertence a outro usuário");
    const all = this.versions(ownerId, project.id), current = all.at(-1)?.version ?? 0;
    if (expectedVersion !== current) throw new ProjectStoreError("VERSION_CONFLICT", `esperada v${expectedVersion}, o servidor está em v${current}: recarregue e reaplique as alterações`);
    const payload = structuredClone(project);
    const row: ServerProjectRecord = { projectId: project.id, ownerId, version: current + 1, parentVersion: current || null, savedAt: this.clock(), payloadSha256: await projectPayloadSha256(payload), snapshotVersion, payload };
    this.rows.push(row);
    return structuredClone(row);
  }
}

/** First upload of the projects that only exist in this browser. Does not touch a single value: payloads are the stored objects themselves. */
export interface MigrationReport { migrated: { projectId: string; version: number; payloadSha256: string }[]; skipped: { projectId: string; reason: string }[]; }
export async function migrateLocalProjects(store: ProjectStore, ownerId: string, snapshot: Snapshot): Promise<MigrationReport> {
  const report: MigrationReport = { migrated: [], skipped: [] };
  const existing = new Map((await store.list(ownerId)).map(r => [r.projectId, r]));
  for (const project of snapshot.projects) {
    const hash = await projectPayloadSha256(project), onServer = existing.get(project.id);
    if (onServer) { report.skipped.push({ projectId: project.id, reason: onServer.payloadSha256 === hash ? "já está no servidor, idêntico" : "já existe no servidor com conteúdo diferente: resolva pelo histórico (nada foi sobrescrito)" }); continue; }
    const saved = await store.save(ownerId, project, 0, snapshot.version);
    if (saved.payloadSha256 !== hash) throw new ProjectStoreError("HASH_MISMATCH", `projeto ${project.id}: o servidor gravou conteúdo diferente do local`);
    report.migrated.push({ projectId: project.id, version: saved.version, payloadSha256: saved.payloadSha256 });
  }
  return report;
}

/** Cache rule: the server version wins when the cache has no unsynced edits; unsynced edits against an older server version are a conflict
 * to resolve explicitly (export/compare), never a silent overwrite in either direction. */
export type CacheDecision = "use-server" | "push-local" | "in-sync" | "conflict";
export function reconcileCache(input: { cachedBaseVersion: number | null; cachedSha256: string; cachedBaseSha256: string | null; server: Pick<ServerProjectRecord, "version" | "payloadSha256"> | null }): CacheDecision {
  const { cachedBaseVersion, cachedSha256, cachedBaseSha256, server } = input;
  if (!server) return "push-local";
  const dirty = cachedBaseSha256 !== null && cachedSha256 !== cachedBaseSha256;
  if (cachedBaseVersion === server.version) return dirty ? "push-local" : "in-sync";
  if (cachedBaseVersion === null) return cachedSha256 === server.payloadSha256 ? "in-sync" : "conflict";
  return dirty ? "conflict" : "use-server";
}
