"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptySnapshot, projectSchema, type Backup, type Material, type Project, type Settings, type Snapshot } from "@/domain/models";
import { browserRepositories, readRawBrowserData, LocalRepositories, STORAGE_KEY } from "@/infrastructure/persistence/local";
import { downloadText } from "@/lib/format";
import type { ShowcaseKind } from "@/domain/showcase-projects";

type SaveState = "saved" | "pending" | "error";
interface DataContextValue {
  data: Snapshot; ready: boolean; fatal: string; error: string; saveState: SaveState;
  saveProject: (project: Project) => void; removeProject: (id: string) => void;
  duplicateProject: (id: string) => Project | undefined; saveSettings: (settings: Settings) => boolean;
  importBackup: (backup: Backup) => { projects: number; materials: number } | undefined;
  flush: () => boolean; reload: () => void; recover: () => void;
  invalidDraft: boolean; setInvalidDraft: (value: boolean) => void;
  saveMaterial: (material: Material) => boolean; removeMaterial: (id: string) => void;
  installExample: () => string | undefined;
  installPlanningExample: () => string | undefined;
  installShowcase: (kind: ShowcaseKind) => string | undefined;
  loadEpoch: number;
}
const DataContext = createContext<DataContextValue | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [invalidDraft, setInvalidDraft] = useState(false);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const repository = useRef<LocalRepositories | null>(null);
  const pending = useRef(new Map<string, Project>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fail = useCallback((e: unknown) => { setError(e instanceof Error ? e.message : "Ocorreu um erro ao salvar."); setSaveState("error"); }, []);
  const reload = useCallback(() => {
    try {
      const repo = browserRepositories();
      let next = repo.load(); repository.current = repo;
      // Replace only old built-in examples; never seed the obsolete garage on startup.
      let migrationError: unknown;
      try { repo.retireLegacyExamples(); next = repo.snapshot(); } catch (e) { migrationError = e; }
      pending.current.clear(); setData(next); setFatal(""); setError(""); setSaveState("saved"); setReady(true);
      setLoadEpoch(epoch => epoch + 1);
      if (migrationError) fail(migrationError);
    } catch (e) { setFatal(e instanceof Error ? e.message : "Armazenamento indisponível."); setReady(true); }
  }, [fail]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!repository.current) return false;
    try {
      for (const [id, project] of pending.current) { repository.current.projects.save(project); pending.current.delete(id); }
      setData(repository.current.snapshot()); setSaveState("saved"); setError(""); return true;
    } catch (e) { fail(e); return false; }
  }, [fail]);
  useEffect(() => {
    // A inicialização só ocorre no cliente, após a hidratação.
    const init = setTimeout(reload, 0);
    return () => clearTimeout(init);
  }, [reload]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if ((pending.current.size > 0 && !flush()) || invalidDraft) { event.preventDefault(); event.returnValue = ""; }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden" && pending.current.size > 0) flush(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setError("Os dados foram alterados em outra aba. Se houver alterações pendentes, exporte um backup antes de recarregar.");
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onVisibility); };
  }, [flush, invalidDraft]);
  const saveProject = useCallback((input: Project) => {
    const project = projectSchema.parse({ ...input, updatedAt: new Date().toISOString() });
    pending.current.set(project.id, project);
    setData(current => ({ ...current, projects: [...current.projects.filter(p => p.id !== project.id), project] }));
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }, [flush]);
  function mutation<T>(action: (repo: LocalRepositories) => T): T | undefined {
    if (!flush() || !repository.current) return undefined;
    try { const result = action(repository.current); setData(repository.current.snapshot()); return result; }
    catch (e) { fail(e); return undefined; }
  }
  return <DataContext.Provider value={{ data, ready, fatal, error, saveState, saveProject, flush, reload,
    invalidDraft, setInvalidDraft, loadEpoch,
    removeProject: id => { mutation(repo => repo.projects.remove(id)); },
    duplicateProject: id => mutation(repo => repo.projects.duplicate(id)),
    saveSettings: settings => mutation(repo => { repo.settings.save(settings); return true; }) ?? false,
    importBackup: backup => mutation(repo => repo.importBackup(backup)),
    saveMaterial: material => mutation(repo => { repo.materials.save(material); return true; }) ?? false,
    removeMaterial: id => { mutation(repo => repo.materials.remove(id)); },
    installExample: () => mutation(repo => repo.installExample()),
    installPlanningExample: () => mutation(repo => repo.installShowcase("cobertura")),
    installShowcase: kind => mutation(repo => repo.installShowcase(kind)),
    recover: () => { try { const raw = readRawBrowserData(); downloadText(raw ?? "null", "jpn-dados-originais.json"); } catch (e) { fail(e); } },
  }}>{children}</DataContext.Provider>;
}
export function useData() { const context = useContext(DataContext); if (!context) throw new Error("DataProvider ausente."); return context; }
