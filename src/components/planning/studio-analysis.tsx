"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { AnalysisResult } from "./mixed-analysis-mode";
import type { ResistanceReport } from "@/domain/resistance-report";
import type { JobProgress } from "@/infrastructure/analysis/async-job-client";
import type { ResultOverlayKind } from "./studio-result-overlay";

/**
 * Ponte somente leitura entre a análise mista (que continua dona do estado, do job e do
 * cache) e o estúdio: inspetor de seleção, resultados no 3D e barra de status.
 * Nada aqui calcula engenharia: só repassa o que a análise já validou para a mesma entrada.
 */
export type StudioMappedMember = { id: string; originalId: string; start: string; end: string };
export type StudioLayer = {
  kind: ResultOverlayKind;
  colors: Record<string, number> | null;
  segments: { a: [number, number, number]; b: [number, number, number] }[] | null;
  legend: { min: number; max: number; units: string } | null;
  scale: number;
  /** Motivos de recusa da camada (entrada diferente, peça sem valor…); null quando aceita. */
  refused: unknown[] | null;
};
export type StudioAnalysisState = "unavailable" | "idle" | "running" | "current" | "stale" | "error";
export type StudioAnalysis = {
  state: StudioAnalysisState;
  ready: boolean;
  health: string;
  job: JobProgress | null;
  error: string;
  combinations: string[];
  combo: string;
  result: AnalysisResult | null;
  mapping: StudioMappedMember[];
  resistance: ResistanceReport | null;
  layerKind: ResultOverlayKind | "none";
  layer: StudioLayer | null;
  scaleInput: string;
};
export type StudioAnalysisCommands = {
  setCombo: (combo: string) => void;
  setLayerKind: (kind: ResultOverlayKind | "none") => void;
  setScale: (value: string) => void;
  run: () => void;
};

const empty: StudioAnalysis = { state: "unavailable", ready: false, health: "", job: null, error: "", combinations: [], combo: "", result: null, mapping: [], resistance: null, layerKind: "none", layer: null, scaleInput: "" };
const noop: StudioAnalysisCommands = { setCombo: () => {}, setLayerKind: () => {}, setScale: () => {}, run: () => {} };

type Bridge = {
  analysis: StudioAnalysis;
  commands: StudioAnalysisCommands;
  /** Momento (ms) em que a execução atual começou; null fora de execução. */
  runningSince: number | null;
  publish: (analysis: StudioAnalysis | null, commands: StudioAnalysisCommands | null) => void;
};
const Context = createContext<Bridge>({ analysis: empty, commands: noop, runningSince: null, publish: () => {} });

export function StudioAnalysisProvider({ children }: { children: ReactNode }) {
  const [analysis, setAnalysis] = useState<StudioAnalysis>(empty);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const commands = useRef<StudioAnalysisCommands>(noop);
  const previousState = useRef<StudioAnalysisState>("unavailable");
  const publish = useCallback((next: StudioAnalysis | null, nextCommands: StudioAnalysisCommands | null) => {
    commands.current = nextCommands ?? noop;
    const value = next ?? empty;
    if (value.state === "running" && previousState.current !== "running") setRunningSince(Date.now());
    if (value.state !== "running" && previousState.current === "running") setRunningSince(null);
    previousState.current = value.state;
    setAnalysis(value);
  }, []);
  // Comandos estáveis que delegam para a última versão publicada.
  const stable = useMemo<StudioAnalysisCommands>(() => ({
    setCombo: c => commands.current.setCombo(c),
    setLayerKind: k => commands.current.setLayerKind(k),
    setScale: v => commands.current.setScale(v),
    run: () => commands.current.run(),
  }), []);
  const value = useMemo(() => ({ analysis, commands: stable, runningSince, publish }), [analysis, stable, runningSince, publish]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useStudioAnalysis() { return useContext(Context); }

/** Esforços extremos de uma peça na combinação ativa, a partir das estações já calculadas. */
export function pieceExtremes(analysis: StudioAnalysis, pieceId: string, stationsOf: (memberId: string) => { n_n: number; vy_n: number; vz_n: number; my_nm: number; mz_nm: number }[] | null) {
  const comb = analysis.result?.combinations[analysis.combo];
  if (!comb) return null;
  const segments = analysis.mapping.filter(m => m.originalId === pieceId);
  if (!segments.length) return null;
  let n = 0, v = 0, m = 0, axialOnly = true, found = false;
  for (const s of segments) {
    const member = comb.members[s.id] as { kind?: string; axial_n?: number } | undefined;
    if (!member) continue;
    found = true;
    const stations = stationsOf(s.id);
    if (!stations) { if (typeof member.axial_n === "number" && Math.abs(member.axial_n) > Math.abs(n)) n = member.axial_n; continue; }
    axialOnly = false;
    for (const st of stations) {
      if (Math.abs(st.n_n) > Math.abs(n)) n = st.n_n;
      v = Math.max(v, Math.hypot(st.vy_n, st.vz_n));
      m = Math.max(m, Math.hypot(st.my_nm, st.mz_nm));
    }
  }
  return found ? { nKn: n / 1000, vKn: axialOnly ? null : v / 1000, mKnM: axialOnly ? null : m / 1000, segments: segments.map(s => s.id) } : null;
}
