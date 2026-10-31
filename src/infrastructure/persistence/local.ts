import { backupSchema, emptySnapshot, migrateSnapshot, snapshotSchema, type Backup, type Project, type Snapshot } from "@/domain/models";
import type { MaterialRepository, ProjectRepository, SettingsRepository } from "@/domain/repositories";
import { exampleMaterials, EXAMPLE_ID } from "@/domain/example";
import { PLANNING_EXAMPLE_ID } from "@/domain/planning-example";
import { PREPROJECT_EXAMPLE_ID } from "@/domain/preproject-example";
import { showcaseProject, SHOWCASE_IDS, type ShowcaseKind } from "@/domain/showcase-projects";

export const STORAGE_KEY = "jpn-projetos:v1";
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export function browserRepositories(): LocalRepositories { return new LocalRepositories(window.localStorage); }
export function readRawBrowserData(): string | null { return window.localStorage.getItem(STORAGE_KEY); }
export function parseBackup(text: string): Backup {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error("O backup excede o limite de 5 MB.");
  try {
    const input = JSON.parse(text);
    return backupSchema.parse({ ...input, data: migrateSnapshot(input.data) });
  }
  catch { throw new Error("Backup inválido ou de versão incompatível. Nenhum dado foi alterado."); }
}
export function serializeBackup(data: Snapshot): string {
  return JSON.stringify({ format: "jpn-projetos-backup", exportedAt: new Date().toISOString(), data: snapshotSchema.parse(data) }, null, 2);
}
export class LocalRepositories {
  private data: Snapshot = emptySnapshot();
  private lastRaw: string | null = null;
  private loaded = false;
  constructor(private storage: StorageAdapter) {}
  load(): Snapshot {
    let raw: string | null;
    try { raw = this.storage.getItem(STORAGE_KEY); }
    catch { throw new Error("Não foi possível ler o armazenamento deste navegador. Verifique suas permissões."); }
    let next: Snapshot;
    try { next = raw === null ? emptySnapshot() : migrateSnapshot(JSON.parse(raw)); }
    catch { throw new Error("Os dados locais estão inválidos ou usam outra versão. A gravação foi bloqueada para preservá-los. Baixe os dados originais para recuperação."); }
    this.lastRaw = raw; this.data = next; this.loaded = true;
    return this.snapshot();
  }
  raw(): string | null { return this.storage.getItem(STORAGE_KEY); }
  snapshot(): Snapshot { return structuredClone(this.data); }
  private commit(next: Snapshot): void {
    if (!this.loaded) throw new Error("Armazenamento não inicializado. Recarregue os dados.");
    const validated = snapshotSchema.parse({ ...next, revision: this.data.revision + 1 });
    const raw = JSON.stringify(validated);
    if (new Blob([serializeBackup(validated)]).size > MAX_BACKUP_BYTES) throw new Error("O conjunto de dados ultrapassa 5 MB e não poderia ser restaurado pelo backup. Exporte e divida os projetos antes de continuar. Nenhum dado salvo foi alterado.");
    try {
      if (this.storage.getItem(STORAGE_KEY) !== this.lastRaw) throw new Error("CONFLICT");
      this.storage.setItem(STORAGE_KEY, raw);
    } catch (error) {
      if (error instanceof Error && error.message === "CONFLICT") throw new Error("Os dados foram alterados em outra aba. Exporte as alterações pendentes e recarregue antes de continuar.");
      throw new Error("Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado. Exporte um backup das alterações pendentes antes de sair.");
    }
    this.data = validated; this.lastRaw = raw;
  }
  projects: ProjectRepository = {
    list: () => structuredClone(this.data.projects),
    save: project => {
      const old = this.data.projects.find(p => p.id === project.id);
      if (old && old.revisions.some((revision, i) => JSON.stringify(project.revisions[i]) !== JSON.stringify(revision))) throw new Error("Revisões registradas são imutáveis. Crie uma nova revisão para alterar o projeto.");
      this.commit({ ...this.data, projects: [...this.data.projects.filter(p => p.id !== project.id), project] });
    },
    remove: id => this.commit({ ...this.data, projects: this.data.projects.filter(p => p.id !== id) }),
    duplicate: id => {
      const original = this.data.projects.find(p => p.id === id);
      if (!original) throw new Error("Projeto não encontrado.");
      const now = new Date().toISOString();
      const copy: Project = { ...structuredClone(original), id: crypto.randomUUID(), name: `${original.name.slice(0, 190)} (cópia)`, status: "Rascunho", createdAt: now, updatedAt: now };
      this.projects.save(copy); return copy;
    },
  };
  materials: MaterialRepository = {
    list: () => structuredClone(this.data.materials),
    save: material => this.commit({ ...this.data, materials: [...this.data.materials.filter(m => m.id !== material.id), material] }),
    remove: id => this.commit({ ...this.data, materials: this.data.materials.filter(m => m.id !== id) }),
  };
  settings: SettingsRepository = { get: () => structuredClone(this.data.settings), save: settings => this.commit({ ...this.data, settings }) };
  retireLegacyExamples(): void {
    // Only the known old built-in IDs are retired. Custom projects, duplicates,
    // imported examples and unrelated IDs are left untouched.
    const retired = new Set([EXAMPLE_ID, PLANNING_EXAMPLE_ID, PREPROJECT_EXAMPLE_ID]);
    const projects = this.data.projects.filter(p => !p.isExample || !retired.has(p.id));
    const oldMaterials = new Set(exampleMaterials().map(m => m.id));
    const referenced = new Set(projects.flatMap(p => p.estimate.materials.map(line => line.materialId).filter(id => id !== null)));
    const materials = this.data.materials.filter(m => !m.isExample || !oldMaterials.has(m.id) || referenced.has(m.id));
    if (projects.length === this.data.projects.length && materials.length === this.data.materials.length) return;
    this.commit({ ...this.data, exampleInstalled: true, projects, materials });
  }
  installShowcase(kind: ShowcaseKind): string {
    const id = SHOWCASE_IDS[kind];
    if (!this.data.projects.some(p => p.id === id)) this.projects.save(showcaseProject(kind));
    return id;
  }
  installExample(): string {
    // Backward-compatible entry point: never recreate the obsolete garage demo.
    const id = this.installShowcase("cobertura");
    if (!this.data.exampleInstalled) this.commit({ ...this.data, exampleInstalled: true });
    return id;
  }
  importBackup(backup: Backup): { projects: number; materials: number } {
    const validated = backupSchema.parse(backup);
    // Importações são sempre cópias. Configurações locais são preservadas.
    const now = new Date().toISOString();
    const materials = validated.data.materials.map(m => ({ ...m, id: crypto.randomUUID(), updatedAt: now }));
    const materialIds = new Map(validated.data.materials.map((m, index) => [m.id, materials[index].id]));
    const projects = validated.data.projects.map(p => ({ ...p, id: crypto.randomUUID(), updatedAt: now,
      estimate: { ...p.estimate, materials: p.estimate.materials.map(line => ({ ...line, materialId: line.materialId ? materialIds.get(line.materialId) ?? null : null })) },
    }));
    this.commit({ ...this.data, projects: [...this.data.projects, ...projects], materials: [...this.data.materials, ...materials] });
    return { projects: projects.length, materials: materials.length };
  }
}
