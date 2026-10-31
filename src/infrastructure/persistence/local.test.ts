import { describe, expect, it } from "vitest";
import { defaultSettings, emptySnapshot, newProject, projectSchema, settingsSchema } from "@/domain/models";
import { decimalInput } from "@/lib/format";
import { exampleMaterials, exampleProject, EXAMPLE_ID } from "@/domain/example";
import { planningExample, PLANNING_EXAMPLE_ID } from "@/domain/planning-example";
import { preprojectExample, PREPROJECT_EXAMPLE_ID } from "@/domain/preproject-example";
import { SHOWCASE_IDS } from "@/domain/showcase-projects";
import { LocalRepositories, MAX_BACKUP_BYTES, parseBackup, serializeBackup, STORAGE_KEY, type StorageAdapter } from "./local";

class MemoryStorage implements StorageAdapter {
  values = new Map<string, string>();
  blocked = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw new Error("QuotaExceededError"); this.values.set(key, value); }
}
function setup() { const storage = new MemoryStorage(); const repo = new LocalRepositories(storage); repo.load(); return { storage, repo }; }
function sampleProject() { return { ...newProject(), name: "Cobertura da oficina", client: "Cliente de teste", location: "São Paulo", description: "Exemplo exclusivo para testes." }; }
describe("Validação dos contratos", () => {
  it("exige nome e cliente sem aceitar espaços em branco", () => {
    expect(projectSchema.safeParse(newProject()).success).toBe(false);
    expect(projectSchema.safeParse({ ...sampleProject(), name: "  " }).success).toBe(false);
    expect(projectSchema.parse(sampleProject()).technicalStatus).toBe("preliminary");
  });
  it("não permite inventar aprovação técnica ou campos de outra versão", () => {
    expect(projectSchema.safeParse({ ...sampleProject(), technicalStatus: "approved" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...sampleProject(), unexpected: 1 }).success).toBe(false);
  });
  it("distingue limites de markup e margem", () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, pricingMode: "margin", defaultPricingPercent: 100 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, pricingMode: "markup", defaultPricingPercent: 100 }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...defaultSettings, defaultWastePercent: -1 }).success).toBe(false);
  });
  it("lê percentuais brasileiros sem aceitar números ambíguos", () => {
    expect(decimalInput("12,5")).toBe(12.5); expect(decimalInput("12.5")).toBe(12.5);
    expect(decimalInput("1.000,00")).toBeNaN(); expect(decimalInput("")).toBeNaN();
  });
});
describe("Persistência versionada", () => {
  it("inicia vazia, salva, edita e recupera de outra instância", () => {
    const { storage, repo } = setup(); const p = sampleProject();
    expect(repo.projects.list()).toEqual([]); repo.projects.save(p);
    repo.projects.save({ ...p, phone: "11999999999" });
    const restored = new LocalRepositories(storage).load();
    expect(restored.projects).toHaveLength(1); expect(restored.projects[0].phone).toBe("11999999999");
    expect(restored.version).toBe(4); expect(restored.revision).toBe(2);
  });
  it("duplica com novo ID e remove apenas o item solicitado", () => {
    const { repo } = setup(); const p = sampleProject(); repo.projects.save(p);
    const copy = repo.projects.duplicate(p.id); expect(copy.id).not.toBe(p.id); expect(copy.name).toContain("(cópia)");
    repo.projects.remove(p.id); expect(repo.projects.list()).toEqual([copy]);
  });
  it("não expõe referências mutáveis", () => {
    const { repo } = setup(); const p = sampleProject(); repo.projects.save(p);
    repo.projects.list()[0].name = "Mudança externa";
    expect(repo.projects.list()[0].name).toBe(p.name);
  });
  it("preserva dados corrompidos e impede gravação", () => {
    const storage = new MemoryStorage(); storage.setItem(STORAGE_KEY, "{corrompido");
    const repo = new LocalRepositories(storage);
    expect(() => repo.load()).toThrow("dados locais"); expect(() => repo.projects.save(sampleProject())).toThrow("não inicializado");
    expect(storage.getItem(STORAGE_KEY)).toBe("{corrompido");
  });
  it("trata falha de leitura", () => {
    const repo = new LocalRepositories({ getItem() { throw new Error("SecurityError"); }, setItem() {} });
    expect(() => repo.load()).toThrow("ler o armazenamento");
  });
  it("não publica gravação malsucedida e permite tentar novamente", () => {
    const { repo, storage } = setup(); const p = sampleProject(); storage.blocked = true;
    expect(() => repo.projects.save(p)).toThrow("Não foi possível salvar"); expect(repo.projects.list()).toHaveLength(0);
    storage.blocked = false; repo.projects.save(p); expect(repo.projects.list()).toHaveLength(1);
  });
  it("detecta alteração por outra aba antes de sobrescrever", () => {
    const { repo, storage } = setup(); const other = new LocalRepositories(storage); other.load();
    repo.projects.save(sampleProject()); expect(() => other.projects.save(sampleProject())).toThrow("outra aba");
    expect(new LocalRepositories(storage).load().projects).toHaveLength(1);
  });
});
describe("Backups", () => {
  it("migra cadastro da fase 1 sem inventar medidas ou custos", () => {
    const p = sampleProject();
    const oldProject = Object.fromEntries(Object.entries(p).filter(([key]) => !["roof", "estimate", "isExample", "planning", "workspace", "revisions"].includes(key)));
    const legacy = { version: 1, revision: 4, projects: [oldProject], materials: [], settings: defaultSettings };
    const storage = new MemoryStorage(); storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const repo = new LocalRepositories(storage), migrated = repo.load();
    expect(migrated.version).toBe(4); expect(migrated.projects[0].id).toBe(p.id);
    expect(migrated.projects[0].roof.widthM).toBeNull(); expect(migrated.projects[0].estimate.materials).toEqual([]);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(1);
    repo.projects.save(migrated.projects[0]); expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(4);
    const backup = parseBackup(JSON.stringify({ format: "jpn-projetos-backup", exportedAt: new Date().toISOString(), data: legacy }));
    expect(backup.data.projects[0].client).toBe(p.client);
  });
  it("remapeia materiais importados sem alterar preços dos itens", () => {
    const { repo } = setup(), project = exampleProject(), materials = exampleMaterials();
    const backup = parseBackup(serializeBackup({ ...emptySnapshot(), projects: [project], materials }));
    repo.importBackup(backup); const snapshot = repo.snapshot();
    expect(snapshot.projects[0].estimate.materials[0].materialId).toBe(snapshot.materials[0].id);
    expect(snapshot.materials[0].id).not.toBe(materials[0].id);
    repo.materials.save({ ...snapshot.materials[0], unitPriceCents: 1 });
    expect(repo.projects.list()[0].estimate.materials[0].unitPriceCents).toBe(8000);
    repo.materials.remove(snapshot.materials[0].id);
    expect(repo.projects.list()[0].estimate.materials[0].name).toBe(project.estimate.materials[0].name);
  });
  it("remove somente exemplos nativos antigos e mantém projetos reais e cópias importadas", () => {
    const { repo, storage } = setup();
    const real = sampleProject(), customCopy = { ...exampleProject(), id: crypto.randomUUID(), name: "Cópia editada pelo usuário" };
    repo.projects.save(real);
    repo.projects.save(exampleProject()); repo.projects.save(planningExample()); repo.projects.save(preprojectExample());
    repo.projects.save(customCopy);
    for (const m of exampleMaterials()) repo.materials.save(m);
    repo.retireLegacyExamples();
    expect(repo.projects.list().map(p => p.id)).toEqual([real.id, customCopy.id]);
    expect(repo.materials.list()).toHaveLength(0);
    expect(repo.snapshot().exampleInstalled).toBe(true);
    const revision = repo.snapshot().revision;
    repo.retireLegacyExamples();
    expect(repo.snapshot().revision).toBe(revision);
    expect(new LocalRepositories(storage).load().projects.map(p => p.id)).toEqual([real.id, customCopy.id]);
  });
  it("preserva material fictício se referenciado por projeto real", () => {
    const { repo } = setup(); const example = exampleProject(); const material = exampleMaterials()[0];
    const real = { ...example, id: crypto.randomUUID(), name: "Projeto real", isExample: false };
    repo.projects.save(example); repo.projects.save(real); repo.materials.save(material);
    repo.retireLegacyExamples();
    expect(repo.projects.list()).toHaveLength(1);
    expect(repo.materials.list()).toHaveLength(1);
  });
  it("instala exemplos novos com IDs estáveis e sem duplicar ao reabrir", () => {
    const { repo } = setup();
    expect(repo.installShowcase("cobertura")).toBe(SHOWCASE_IDS.cobertura);
    expect(repo.installShowcase("galpao")).toBe(SHOWCASE_IDS.galpao);
    expect(repo.installShowcase("cobertura")).toBe(SHOWCASE_IDS.cobertura);
    expect(repo.projects.list()).toHaveLength(2);
    expect(repo.projects.list().every(p => p.isExample)).toBe(true);
    expect(repo.projects.list().some(p => p.id === EXAMPLE_ID || p.id === PLANNING_EXAMPLE_ID || p.id === PREPROJECT_EXAMPLE_ID)).toBe(false);
  });
  it("cria exemplo identificado sem sobrescrever nem recriar após exclusão", () => {
    const { repo, storage } = setup(); repo.projects.save(sampleProject()); repo.installExample();
    expect(repo.projects.list()).toHaveLength(2); expect(repo.snapshot().exampleInstalled).toBe(true);
    const demo = repo.projects.list().find(p => p.isExample)!;
    repo.projects.save({ ...demo, name: "Exemplo editado" }); repo.installExample();
    expect(repo.projects.list().find(p => p.isExample)?.name).toBe("Exemplo editado");
    repo.projects.remove(demo.id); const loaded = new LocalRepositories(storage).load();
    expect(loaded.projects).toHaveLength(1); expect(loaded.exampleInstalled).toBe(true);
  });
  it("faz round-trip preservando todos os campos", () => {
    const data = { ...emptySnapshot(), projects: [sampleProject()] };
    expect(parseBackup(serializeBackup(data)).data).toEqual(data);
  });
  it("rejeita JSON inválido, versão incompatível e projetos inválidos", () => {
    expect(() => parseBackup("nada")).toThrow("Backup inválido");
    const data = JSON.parse(serializeBackup(emptySnapshot())); data.data.version = 99;
    expect(() => parseBackup(JSON.stringify(data))).toThrow("versão incompatível");
    data.data.version = 2; data.data.projects = [newProject()];
    expect(() => parseBackup(JSON.stringify(data))).toThrow("Backup inválido");
  });
  it("rejeita IDs duplicados e arquivos grandes", () => {
    const p = sampleProject();
    expect(() => serializeBackup({ ...emptySnapshot(), projects: [p, p] })).toThrow();
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow("5 MB");
  });
  it("importa como cópias, mantém configurações locais e nunca sobrescreve", () => {
    const { repo } = setup(); const p = sampleProject(); repo.projects.save(p);
    const backup = parseBackup(serializeBackup(repo.snapshot()));
    repo.settings.save({ ...defaultSettings, companyName: "Empresa local" });
    repo.importBackup(backup); repo.importBackup(backup);
    expect(repo.projects.list()).toHaveLength(3);
    expect(new Set(repo.projects.list().map(p => p.id)).size).toBe(3);
    expect(repo.projects.list()[0]).toEqual(p); expect(repo.settings.get().companyName).toBe("Empresa local");
  });
  it("importação é atômica quando falta espaço", () => {
    const { repo, storage } = setup(); const p = sampleProject(); repo.projects.save(p);
    const before = repo.snapshot(); storage.blocked = true;
    expect(() => repo.importBackup(parseBackup(serializeBackup(before)))).toThrow(); expect(repo.snapshot()).toEqual(before);
  });
});
