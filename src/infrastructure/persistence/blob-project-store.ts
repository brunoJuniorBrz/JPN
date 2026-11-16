import { get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import type { Project } from "@/domain/models";
import { ProjectStoreError, projectPayloadSha256, type ProjectStore, type ServerProjectRecord } from "@/domain/server-projects";
import { PROJECT_ID } from "./file-project-store";

/** Durable project storage on Vercel Blob (private store). Same contract as the file store:
 * - every version is its own blob `projects/<owner hash>/<projectId>/v000001.json`, created with `allowOverwrite:false`: a version that exists is never rewritten,
 *   and two saves of the same expected version cannot both win (the loser gets VERSION_CONFLICT);
 * - the stored payload is re-hashed on every read (HASH_MISMATCH if it no longer matches what was recorded);
 * - the owner id is a hash in the path, derived by the server. Needs `BLOB_READ_WRITE_TOKEN` (the store is created and connected by the project owner). */
export interface BlobPort {
  /** Must reject with an "already exists" error when the pathname is taken. */
  putExclusive(pathname: string, body: string): Promise<void>;
  /** All pathnames under the prefix (every page). */
  list(prefix: string): Promise<string[]>;
  /** Text content, or null when the blob does not exist. Reads from origin (no CDN cache). */
  getText(pathname: string): Promise<string | null>;
}

export const blobAlreadyExists = (e: unknown) => e instanceof Error && /already exists/i.test(e.message);

export function vercelBlobPort(token?: string): BlobPort {
  const auth = token ? { token } : {};
  return {
    async putExclusive(pathname, body) {
      await put(pathname, body, { access: "private", allowOverwrite: false, addRandomSuffix: false, contentType: "application/json", ...auth });
    },
    async list(prefix) {
      const out: string[] = []; let cursor: string | undefined;
      do { const page = await list({ prefix, limit: 1000, cursor, ...auth }); out.push(...page.blobs.map(b => b.pathname)); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
      return out;
    },
    async getText(pathname) {
      const result = await get(pathname, { access: "private", useCache: false, ...auth });
      if (!result || result.statusCode !== 200) return null;
      return await new Response(result.stream).text();
    },
  };
}

const ownerPrefix = (owner: string) => "projects/" + createHash("sha256").update("jpn-owner/1\0" + owner).digest("hex").slice(0, 24) + "/";
const versionName = (n: number) => `v${String(n).padStart(6, "0")}.json`;
const parse = (pathname: string) => /^projects\/[a-f0-9]{24}\/([^/]+)\/v(\d{6})\.json$/.exec(pathname);

export class BlobProjectStore implements ProjectStore {
  constructor(private port: BlobPort, private clock: () => string = () => new Date().toISOString()) {}
  private prefix(owner: string, projectId: string) {
    if (!owner) throw new ProjectStoreError("FORBIDDEN", "usuário ausente");
    if (!PROJECT_ID.test(projectId) || projectId.includes("..")) throw new ProjectStoreError("NOT_FOUND", "identificador de projeto inválido");
    return ownerPrefix(owner) + projectId + "/";
  }
  private async versions(owner: string, projectId: string) {
    return (await this.port.list(this.prefix(owner, projectId))).map(p => parse(p)).filter((m): m is RegExpExecArray => !!m && m[1] === projectId).map(m => Number(m[2])).sort((a, b) => a - b);
  }
  private async read(owner: string, projectId: string, version: number) {
    const text = await this.port.getText(this.prefix(owner, projectId) + versionName(version));
    if (text === null) throw new ProjectStoreError("NOT_FOUND", `projeto ${projectId} v${version} inexistente para este usuário`);
    const record = JSON.parse(text) as ServerProjectRecord;
    if (await projectPayloadSha256(record.payload) !== record.payloadSha256) throw new ProjectStoreError("HASH_MISMATCH", `${projectId} v${version}: conteúdo armazenado difere do registrado`);
    return record;
  }
  async list(owner: string) {
    const latest = new Map<string, number>();
    for (const p of await this.port.list(ownerPrefix(owner))) { const m = parse(p); if (m && PROJECT_ID.test(m[1])) latest.set(m[1], Math.max(latest.get(m[1]) ?? 0, Number(m[2]))); }
    return Promise.all([...latest].map(([id, v]) => this.read(owner, id, v)));
  }
  async get(owner: string, projectId: string, version?: number) {
    const all = await this.versions(owner, projectId), v = version ?? all.at(-1);
    if (!v || !all.includes(v)) throw new ProjectStoreError("NOT_FOUND", `projeto ${projectId}${version ? ` v${version}` : ""} inexistente para este usuário`);
    return this.read(owner, projectId, v);
  }
  async history(owner: string, projectId: string) { return Promise.all((await this.versions(owner, projectId)).map(v => this.read(owner, projectId, v))); }
  async save(owner: string, project: Project, expectedVersion: number, snapshotVersion: number) {
    const prefix = this.prefix(owner, project.id), current = (await this.versions(owner, project.id)).at(-1) ?? 0;
    if (expectedVersion !== current) throw new ProjectStoreError("VERSION_CONFLICT", `esperada v${expectedVersion}, o servidor está em v${current}: recarregue e reaplique as alterações`);
    const payload = JSON.parse(JSON.stringify(project)) as Project;
    const record: ServerProjectRecord = { projectId: project.id, ownerId: owner, version: current + 1, parentVersion: current || null, savedAt: this.clock(), payloadSha256: await projectPayloadSha256(payload), snapshotVersion, payload };
    try { await this.port.putExclusive(prefix + versionName(record.version), JSON.stringify(record)); }
    catch (e) {
      // Exclusive creation is the arbiter: even with a stale listing, a taken version is a conflict, never an overwrite.
      if (blobAlreadyExists(e)) throw new ProjectStoreError("VERSION_CONFLICT", `outra gravação criou a v${record.version} antes: recarregue e reaplique as alterações`);
      throw e;
    }
    return record;
  }
}
