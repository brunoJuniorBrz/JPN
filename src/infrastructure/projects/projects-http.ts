import path from "node:path";
import { projectSchema, type Project } from "@/domain/models";
import { ProjectStoreError, type ProjectStore, type ServerProjectRecord } from "@/domain/server-projects";
import { FileProjectStore, PROJECT_ID } from "@/infrastructure/persistence/file-project-store";
import { BlobProjectStore, vercelBlobPort } from "@/infrastructure/persistence/blob-project-store";
import { remoteMixedAccess, remoteMixedEnabled } from "@/infrastructure/analysis/remote-mixed-runner";
import { MAX_BACKUP_BYTES } from "@/infrastructure/persistence/local";

/** Projects API for the SINGLE operator (no external login provider). Access = the operator that already runs the engine
 * (HTTP Basic + exact origin, `remoteMixedAccess`) or, in local development, the same-origin local launcher. The owner id is derived on the
 * server; a client can never choose it. */
const noStore = { "Cache-Control": "no-store" };
export const projectsRoot = () => path.resolve(process.env.JPN_PROJECTS_DIR || ".data/projects");
let injected: ProjectStore | null = null;
export const useProjectStore = (store: ProjectStore | null) => { injected = store; };
/** Backend choice. Production = Vercel Blob (`BLOB_READ_WRITE_TOKEN`, created by the project owner). Local disk only for development/tests
 * (or `JPN_PROJECTS_BACKEND=file`). Without either, the API refuses (503 PROJECTS_STORAGE_UNCONFIGURED) instead of silently using an ephemeral disk. */
const store = (): ProjectStore => {
  if (injected) return injected;
  const forced = process.env.JPN_PROJECTS_BACKEND;
  const localRuntime = ["development", "test"].includes(process.env.NODE_ENV ?? "");
  if (forced === "file" && !localRuntime)
    throw new ProjectStoreError("UNCONFIGURED", "Armazenamento em arquivos é permitido apenas em desenvolvimento e testes.");
  if (localRuntime && (forced === "file" || (forced !== "blob" && !process.env.BLOB_READ_WRITE_TOKEN))) return new FileProjectStore(projectsRoot());
  if (process.env.BLOB_READ_WRITE_TOKEN) return new BlobProjectStore(vercelBlobPort(process.env.BLOB_READ_WRITE_TOKEN));
  throw new ProjectStoreError("UNCONFIGURED", "Armazenamento de projetos não configurado: crie o Blob store privado e defina BLOB_READ_WRITE_TOKEN (o disco local é só para desenvolvimento).");
};

function reply(body: unknown, status = 200, headers: HeadersInit = noStore) { return Response.json(body, { status, headers }); }
function fail(code: string, message: string, status: number, headers: HeadersInit = noStore) { return reply({ error: { code, message } }, status, headers); }

export function operatorOf(request: Request, post = false): { owner: string } | Response {
  if (remoteMixedEnabled()) {
    const denied = remoteMixedAccess(request, post);
    if (denied) return fail(denied.code, denied.message, denied.status, denied.status === 401 ? { ...noStore, "WWW-Authenticate": 'Basic realm="JPN experimental", charset="UTF-8"' } : noStore);
    return { owner: "operator:" + (process.env.JPN_MIXED_ACCESS_USER ?? "") };
  }
  const expected = process.env.JPN_LOCAL_MIXED_ORIGIN;
  if (process.env.NODE_ENV === "development" && process.env.JPN_LOCAL_MIXED_ENABLED === "1" && expected) {
    try {
      const url = new URL(request.url), origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
      if (["localhost", "127.0.0.1"].includes(url.hostname) && request.headers.get("host") === new URL(expected).host && (!post || origin === expected) && (!origin || origin === expected) && (!site || ["same-origin", "none"].includes(site)))
        return { owner: "local-operator" };
    } catch { /* falls through */ }
  }
  return fail("PROJECTS_DISABLED", "Projetos no servidor exigem o acesso de operador (JPN_MIXED_REMOTE_ENABLED) ou o executor local de desenvolvimento.", 403);
}
function failure(e: unknown) {
  if (e instanceof ProjectStoreError) return fail(e.code === "UNCONFIGURED" ? "PROJECTS_STORAGE_UNCONFIGURED" : e.code, e.message.replace(/^[A-Z_]+: /, ""), e.code === "VERSION_CONFLICT" ? 409 : e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : e.code === "UNCONFIGURED" ? 503 : 500);
  return fail("UNAVAILABLE", "Armazenamento de projetos indisponível.", 503);
}
const summary = (r: ServerProjectRecord) => ({ projectId: r.projectId, version: r.version, parentVersion: r.parentVersion, savedAt: r.savedAt, payloadSha256: r.payloadSha256, snapshotVersion: r.snapshotVersion, name: r.payload.name });

export async function listProjects(request: Request) {
  const who = operatorOf(request); if (who instanceof Response) return who;
  try { return reply({ projects: (await store().list(who.owner)).map(summary) }); } catch (e) { return failure(e); }
}
export async function getProject(request: Request, projectId: string) {
  const who = operatorOf(request); if (who instanceof Response) return who;
  if (!PROJECT_ID.test(projectId)) return fail("NOT_FOUND", "Projeto inexistente.", 404);
  const v = new URL(request.url).searchParams.get("version"), version = v === null ? undefined : Number(v);
  if (version !== undefined && !(Number.isInteger(version) && version >= 1)) return fail("INVALID_INPUT", "Versão inválida.", 400);
  try { return reply({ record: await store().get(who.owner, projectId, version) }); } catch (e) { return failure(e); }
}
export async function saveProject(request: Request, projectId: string) {
  const who = operatorOf(request, true); if (who instanceof Response) return who;
  if (!PROJECT_ID.test(projectId)) return fail("NOT_FOUND", "Projeto inexistente.", 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("INVALID_INPUT", "Envie JSON.", 400);
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BACKUP_BYTES) return fail("INPUT_LIMIT", "O projeto excede o limite de 5 MB.", 413);
  let body: { project?: unknown; expectedVersion?: unknown; snapshotVersion?: unknown };
  try { body = JSON.parse(text); } catch { return fail("INVALID_INPUT", "JSON inválido.", 400); }
  const expected = body.expectedVersion, snapshotVersion = body.snapshotVersion;
  if (!Number.isInteger(expected) || (expected as number) < 0 || !Number.isInteger(snapshotVersion) || (snapshotVersion as number) < 1) return fail("INVALID_INPUT", "Versões esperada e do formato são obrigatórias.", 400);
  // Validation only: the STORED payload is exactly what was sent (parse() would add defaults and could change data).
  const parsed = projectSchema.safeParse(body.project);
  if (!parsed.success) return fail("INVALID_INPUT", "Projeto incompatível com o formato atual.", 400);
  const project = body.project as Project;
  if (project.id !== projectId) return fail("INVALID_INPUT", "O identificador do projeto não corresponde ao da rota.", 400);
  try { return reply({ record: summary(await store().save(who.owner, project, expected as number, snapshotVersion as number)) }); } catch (e) { return failure(e); }
}
