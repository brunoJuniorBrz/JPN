import type { Project } from "@/domain/models";
import { ProjectStoreError, type ProjectStore, type ServerProjectRecord } from "@/domain/server-projects";

/** Browser-side `ProjectStore` over /api/projects (same origin). The owner is decided by the server, never by this client. */
type Summary = Omit<ServerProjectRecord, "payload" | "ownerId"> & { name: string };
async function check(response: Response) {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  const code = body.error?.code ?? String(response.status);
  throw new ProjectStoreError((["VERSION_CONFLICT", "NOT_FOUND", "FORBIDDEN", "HASH_MISMATCH"].includes(code) ? code : "FORBIDDEN") as ProjectStoreError["code"], body.error?.message ?? `${code}: o servidor recusou a operação`);
}
export class HttpProjectStore implements ProjectStore {
  constructor(private base = "/api/projects", private doFetch: typeof fetch = (...a) => fetch(...a)) {}
  async summaries(): Promise<Summary[]> { return (await check(await this.doFetch(this.base))).projects; }
  async list() {
    const rows = await this.summaries();
    return Promise.all(rows.map(r => this.get("", r.projectId)));
  }
  async get(_owner: string, projectId: string, version?: number) {
    return (await check(await this.doFetch(`${this.base}/${encodeURIComponent(projectId)}${version ? `?version=${version}` : ""}`))).record as ServerProjectRecord;
  }
  async history(_owner: string, projectId: string) {
    const latest = await this.get("", projectId), out: ServerProjectRecord[] = [];
    for (let v = 1; v <= latest.version; v++) out.push(v === latest.version ? latest : await this.get("", projectId, v));
    return out;
  }
  async save(_owner: string, project: Project, expectedVersion: number, snapshotVersion: number) {
    const sent = await check(await this.doFetch(`${this.base}/${encodeURIComponent(project.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, expectedVersion, snapshotVersion }) }));
    return { ...sent.record, ownerId: "server", payload: project } as ServerProjectRecord;
  }
}
