import { link, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import type { Project } from "@/domain/models";
import { ProjectStoreError, projectPayloadSha256, type ProjectStore, type ServerProjectRecord } from "@/domain/server-projects";

/** Single-operator persistence WITHOUT any external service: versioned JSON files on the server's own disk.
 * Layout: <root>/<sha256(owner)[0..24]>/<projectId>/v<N>.json. A version file is created with the exclusive flag, so two concurrent saves
 * of the same expected version cannot both win (VERSION_CONFLICT), and a stored version is never rewritten.
 * Durable on a server with a real disk (local, VM, container with a volume). The serverless filesystem of Vercel is ephemeral:
 * production on Vercel needs a durable adapter for the same `ProjectStore` port (docs/INT-2-CONTAS-E-PROJETOS.md). */
export const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const ownerDir = (owner: string) => createHash("sha256").update("jpn-owner/1\0" + owner).digest("hex").slice(0, 24);
const versionFile = (n: number) => `v${String(n).padStart(6, "0")}.json`;

export class FileProjectStore implements ProjectStore {
  constructor(private root: string, private clock: () => string = () => new Date().toISOString()) {}
  private dir(owner: string, projectId: string) {
    if (!owner) throw new ProjectStoreError("FORBIDDEN", "usuário ausente");
    if (!PROJECT_ID.test(projectId) || projectId.includes("..")) throw new ProjectStoreError("NOT_FOUND", "identificador de projeto inválido");
    return path.join(this.root, ownerDir(owner), projectId);
  }
  private async versions(owner: string, projectId: string): Promise<number[]> {
    try { return (await readdir(this.dir(owner, projectId))).map(f => /^v(\d{6})\.json$/.exec(f)?.[1]).filter((v): v is string => !!v).map(Number).sort((a, b) => a - b); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  }
  private async read(owner: string, projectId: string, version: number) {
    const record = JSON.parse(await readFile(path.join(this.dir(owner, projectId), versionFile(version)), "utf8")) as ServerProjectRecord;
    // Reading never trusts the disk blindly: the stored payload must still hash to what was recorded.
    if (await projectPayloadSha256(record.payload) !== record.payloadSha256) throw new ProjectStoreError("HASH_MISMATCH", `${projectId} v${version}: conteúdo em disco difere do registrado`);
    return record;
  }
  async list(owner: string) {
    let ids: string[] = [];
    try { ids = await readdir(path.join(this.root, ownerDir(owner))); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    const out: ServerProjectRecord[] = [];
    for (const id of ids.filter(i => PROJECT_ID.test(i))) { const v = (await this.versions(owner, id)).at(-1); if (v) out.push(await this.read(owner, id, v)); }
    return out;
  }
  async get(owner: string, projectId: string, version?: number) {
    const all = await this.versions(owner, projectId), v = version ?? all.at(-1);
    if (!v || !all.includes(v)) throw new ProjectStoreError("NOT_FOUND", `projeto ${projectId}${version ? ` v${version}` : ""} inexistente para este usuário`);
    return this.read(owner, projectId, v);
  }
  async history(owner: string, projectId: string) { return Promise.all((await this.versions(owner, projectId)).map(v => this.read(owner, projectId, v))); }
  async save(owner: string, project: Project, expectedVersion: number, snapshotVersion: number) {
    const dir = this.dir(owner, project.id), current = (await this.versions(owner, project.id)).at(-1) ?? 0;
    if (expectedVersion !== current) throw new ProjectStoreError("VERSION_CONFLICT", `esperada v${expectedVersion}, o servidor está em v${current}: recarregue e reaplique as alterações`);
    const payload = JSON.parse(JSON.stringify(project)) as Project;
    const record: ServerProjectRecord = { projectId: project.id, ownerId: owner, version: current + 1, parentVersion: current || null, savedAt: this.clock(), payloadSha256: await projectPayloadSha256(payload), snapshotVersion, payload };
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.tmp-${randomBytes(6).toString("hex")}`), final = path.join(dir, versionFile(record.version));
    await writeFile(tmp, JSON.stringify(record), { flag: "wx" });
    // link() is atomic and fails if the version already exists: a concurrent winner makes this save a VERSION_CONFLICT, never a rewrite,
    // and a reader can only ever see a complete file.
    try { await link(tmp, final); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new ProjectStoreError("VERSION_CONFLICT", `outra gravação criou a v${record.version} antes: recarregue e reaplique as alterações`); throw e; }
    finally { await rm(tmp, { force: true }); }
    return record;
  }
}
