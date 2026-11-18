"use client";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Check, FilePlus2, Lock, RotateCcw, Undo2 } from "lucide-react";
import type { Project } from "@/domain/models";
import { roles, type PieceRole } from "@/domain/structure";
import { studioModelFromPhysical } from "@/domain/studio-result-layers";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { applyTrussToProject, blankTruss, fallPercent, slopeCount, stations, tomTrussDefaults, trussEditorSchema, trussIssues, trussLengthMm, trussSummary, type TrussEditor as Truss } from "@/domain/truss-editor";
import { Badge } from "@/components/ui/badge";
import type { SiteVisibility, Viewer3DApi, Viewer3DLabel } from "@/components/planning/structure-3d";
import { pieceIdsForStation, TrussDrawing, TrussForm, TrussPointPanel, TrussSummaryChips, type TrussSectionId } from "./truss-parts";

const Structure3D = dynamic(() => import("@/components/planning/structure-3d").then(m => m.Structure3D), { ssr: false, loading: () => <p role="status">Carregando modelo 3D…</p> });
const cm = (mm: number) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const m2 = (mm: number) => (mm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type LiveDraft = { project: Project; truss: Truss; ms: number | null };
function buildDraft(project: Project, working: Truss, timed: boolean): LiveDraft | null {
  const t0 = timed ? performance.now() : 0;
  try { const truss = trussEditorSchema.parse(working); return { project: applyTrussToProject(project, truss), truss, ms: timed ? performance.now() - t0 : null }; }
  catch { return null; }
}
/**
 * Rascunho ao vivo: ~150 ms depois da última alteração, gera em memória o projeto com a tesoura
 * (applyTrussToProject é puro: clona o projeto). Nada é salvo; medidas inválidas mantêm o último rascunho válido.
 */
export function useLiveTrussDraft(project: Project, working: Truss, enabled: boolean, ms = 150) {
  const [draft, setDraft] = useState<LiveDraft | null>(() => enabled ? buildDraft(project, working, false) : null);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => { const next = buildDraft(project, working, true); if (next) setDraft(next); }, ms);
    return () => window.clearTimeout(timer);
  }, [project, working, enabled, ms]);
  return enabled ? draft : null;
}
const wideQuery = "(min-width: 1200px)";
function useWide() {
  return useSyncExternalStore(cb => { const q = matchMedia(wideQuery); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); }, () => matchMedia(wideQuery).matches, () => true);
}

export type TrussView = "3d" | "elevation" | "split";
const trussRoles: PieceRole[] = ["topChord", "bottomChord", "web"], purlinRoles: PieceRole[] = ["purlin"];
type Layers = SiteVisibility & { trusses: boolean; purlins: boolean };
const layerLabels: [keyof Layers, string][] = [["trusses", "Tesouras"], ["purlins", "Terças"], ["sheet", "Telha"], ["walls", "Muros"], ["gutter", "Calha"], ["plates", "Chapas"]];

/** Rótulos curtos no 3D: vão, comprimento, alturas e caída (âncoras na tesoura 1). */
function trussLabels(t: Truss, pieceIds: string[], station: number | null, hovered: number | null): Viewer3DLabel[] {
  const S = slopeCount(t), side = S === 2 ? "E-" : "";
  // Âncoras espalhadas (peça do meio de cada grupo) para os rótulos não se amontoarem na ponta.
  const middle = (re: RegExp) => { const ids = pieceIds.filter(id => re.test(id)); return ids[Math.floor(ids.length / 2)]; };
  const trusses = new Set(pieceIds.map(id => /^T(\d+)-/.exec(id)?.[1]).filter(Boolean)).size;
  const n = stations(t).length, out: Viewer3DLabel[] = [];
  const add = (key: string, pieceId: string | undefined, text: string, tone?: Viewer3DLabel["tone"]) => { if (pieceId) out.push({ key, pieceId, text, tone }); };
  add("vao", middle(/^T1-(?:E-)?BI/), `vão ${m2(t.spanMm)} m muro a muro`);
  add("comp", middle(/^TE1-/), `comprimento ${m2(t.lengthMm)} m`);
  add("ponta", `T1-${side}M1`, `ponta ${cm(t.tipHeightMm)} cm`);
  add("alto", `T${trusses || 1}-${side}M${n}`, `${S === 2 ? "cumeeira" : "alto"} ${cm(t.highHeightMm)} cm`);
  add("caida", middle(new RegExp(`^T${Math.max(1, Math.ceil(trusses / 2))}-(?:E-)?BS`)), `caída ${fallPercent(t).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %`);
  for (const [i, tone] of [[station, "warn"], [hovered, "ok"]] as const) if (i !== null) pieceIdsForStation(t, i).forEach((id, f) => out.push({ key: `st-${tone}-${f}`, pieceId: id, text: `M${i + 1}`, tone }));
  return out.filter(l => !l.pieceId || pieceIds.includes(l.pieceId));
}

/** Viewport do passo Tesoura: 3D | Elevação | Lado a lado (≥1200px), o canvas ocupa a área. */
export function TrussStudioViewport({ project, truss, liveTruss, draftMs = null, view, onView, selected, onSelectPiece, station, hovered, onStation, onHover, onChange, onApi, api }: {
  project: Project; truss: Truss; liveTruss: Truss; draftMs?: number | null; view: TrussView; onView: (v: TrussView) => void;
  selected: string; onSelectPiece: (id: string) => void; station: number | null; hovered: number | null;
  onStation: (i: number | null) => void; onHover: (i: number | null) => void; onChange: (patch: Partial<Truss>) => void;
  onApi: (api: Viewer3DApi | null) => void; api: Viewer3DApi | null;
}) {
  const wide = useWide(), effective: TrussView = view === "split" && !wide ? "3d" : view;
  const [layers, setLayers] = useState<Layers>({ trusses: true, purlins: true, sheet: true, walls: true, gutter: true, plates: true });
  const model = useMemo(() => {
    if (!project.workspace.physicalStructure) return null;
    try { const physical = resolvePhysicalStructure(project).model; return physical ? studioModelFromPhysical(physical) : null; } catch { return null; }
  }, [project]);
  const labels = useMemo(() => model ? trussLabels(truss, model.pieces.map(p => p.id), station, hovered) : [], [model, truss, station, hovered]);
  const siteVisibility = useMemo<SiteVisibility>(() => ({ walls: layers.walls, gutter: layers.gutter, sheet: layers.sheet, plates: layers.plates }), [layers]);
  // Camadas Tesouras/Terças só escondem os próprios papéis; os demais continuam visíveis.
  useEffect(() => {
    api?.setRoles?.(roles.filter(r => (layers.trusses || !trussRoles.includes(r)) && (layers.purlins || !purlinRoles.includes(r))));
  }, [api, layers.trusses, layers.purlins]);
  const toggle = (k: keyof Layers) => setLayers(l => ({ ...l, [k]: !l[k] }));
  const three = model && <div className="result-model-panel truss-3d">
    <Structure3D model={model} roof={project.roof} planning={project.planning} projectName={project.name} selected={selected} onSelect={onSelectPiece}
      compact orientationCube allowPresentation={false} siteContext={truss} siteVisibility={siteVisibility} labels={labels} onApi={onApi} />
  </div>;
  const drawing = <div className="truss-elevation"><TrussDrawing t={liveTruss} selected={station} hovered={hovered} onSelect={onStation} onHover={onHover} onChange={onChange} /></div>;
  return <section className={`truss-viewport truss-viewport--${effective}`} aria-label="Tesoura: 3D e elevação" data-testid="truss-viewport" data-view={effective}
    data-pieces={model?.pieces.length ?? 0} data-high-mm={truss.highHeightMm} data-draft-ms={draftMs === null ? undefined : draftMs.toFixed(1)}>
    <div className="truss-toolbar">
      <div className="truss-segmented" role="group" aria-label="Visualização da tesoura">
        {([["3d", "3D"], ["elevation", "Elevação"], ["split", "Lado a lado"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={effective === id} className={id === "split" ? "truss-split-only" : undefined} onClick={() => onView(id)}>{label}</button>)}
      </div>
      {effective !== "elevation" && <div className="truss-segmented" role="group" aria-label="Câmera">
        <button type="button" onClick={() => api?.view?.("front", true)}>Frente da tesoura</button>
        <button type="button" onClick={() => api?.view?.("iso", false)}>Iso</button>
      </div>}
      {effective !== "elevation" && <div className="truss-layers" role="group" aria-label="Camadas do 3D">
        {layerLabels.map(([k, label]) => <button key={k} type="button" aria-pressed={layers[k]} onClick={() => toggle(k)}>{label}</button>)}
      </div>}
    </div>
    <div className="truss-stage">
      {/* Posições fixas: alternar 3D ↔ Lado a lado não remonta o visualizador (mesmo renderer WebGL). */}
      {effective !== "3d" && drawing}
      {effective !== "elevation" && three}
    </div>
  </section>;
}

/** Inspetor do passo Tesoura: resumo fixo, seções recolhíveis, ponto selecionado e Aplicar/Descartar fixos. */
export function TrussInspector({ applied, working, isDraft, set, setT, station, onStation, section, onSection, onApply, onDiscard, onReplace }: {
  applied: Truss | null; working: Truss; isDraft: boolean; set: (p: Partial<Truss>) => void; setT: (f: (prev: Truss) => Truss) => void;
  station: number | null; onStation: (i: number | null) => void; section: TrussSectionId; onSection: (id: TrussSectionId) => void;
  onApply: (t: Truss) => void; onDiscard: () => void; onReplace: (t: Truss) => void;
}) {
  const delta = useMemo(() => {
    try {
      const now = trussSummary(trussEditorSchema.parse(working)), before = applied ? trussSummary(applied) : null;
      if (!before) return null;
      const bars = (s: typeof now) => s.buy.chord + s.buy.web + s.buy.purlin;
      return { bars: bars(now) - bars(before), kg: now.kg.total - before.kg.total };
    } catch { return null; }
  }, [working, applied]);
  const errors = useMemo(() => { try { return trussIssues(trussEditorSchema.parse(working)).filter(i => i.level === "erro"); } catch { return [{ level: "erro" as const, message: "Medidas inválidas." }]; } }, [working]);
  const signed = (v: number, digits = 0) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: digits })}`;
  return <div className="truss-inspector" data-testid="truss-inspector">
    <div className="truss-inspector-top">
      <TrussSummaryChips t={working} />
      {isDraft && <div className="truss-draft" role="status" data-testid="truss-draft-badge">
        <Badge tone="warning">RASCUNHO — não aplicado</Badge>
        {delta && <span>Δ {signed(delta.bars)} barras · Δ {signed(delta.kg)} kg</span>}
      </div>}
    </div>
    {station !== null && <TrussPointPanel t={working} index={station} set={set} onClear={() => onStation(null)} />}
    <TrussForm t={working} set={set} setT={setT} open={section} onOpen={onSection} />
    <div className="truss-start">
      <span>Recomeçar rascunho:</span>
      <button type="button" className="button secondary" onClick={() => onReplace(blankTruss())}><FilePlus2 size={16} aria-hidden="true" />Nova obra</button>
      <button type="button" className="button secondary" onClick={() => onReplace(tomTrussDefaults())}><RotateCcw size={16} aria-hidden="true" />Exemplo 8×10</button>
    </div>
    <p className="truss-notice">Estudo de conferência: muros, calha, telha, chapas e chumbadores são só contexto visual. Sem cargas, vínculos, rigidez ou capacidades. Fabricação bloqueada até revisão do engenheiro.</p>
    <div className="truss-inspector-footer">
      <button type="button" className="button" disabled={!isDraft || errors.length > 0} onClick={() => onApply(trussEditorSchema.parse(working))}><Check size={18} aria-hidden="true" />Aplicar</button>
      <button type="button" className="button secondary" disabled={!isDraft || !applied} onClick={onDiscard}><Undo2 size={18} aria-hidden="true" />Descartar</button>
    </div>
  </div>;
}

/** Barra de status no passo Tesoura (modo construtor): só o selo de estudo e os KPIs da tesoura. */
export function TrussStatus({ t, children }: { t: Truss; children?: ReactNode }) {
  return <>
    <Badge tone="danger" icon={<Lock />} className="studio-lock" data-testid="fabrication-seal" data-mode="truss-study">Estudo · fabricação bloqueada</Badge>
    <TrussSummaryChips t={t} compact />
    <span className="truss-status-span">{trussLengthMm(t) > 0 ? `${slopeCount(t)} água(s)` : ""}</span>
    {children}
  </>;
}
