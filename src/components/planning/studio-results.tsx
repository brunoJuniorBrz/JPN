"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Play } from "lucide-react";
import type { StructureModel } from "@/domain/structure";
import { formatMeasure } from "@/domain/calculations/units";
import { resultOverlayKinds, type ResultOverlayKind } from "./studio-result-overlay";
import type { Viewer3DLabel } from "./structure-3d";
import { useStudioAnalysis, type StudioAnalysis } from "./studio-analysis";

export const layerLabels: Record<ResultOverlayKind, string> = {
  displacement: "Deslocamento", "deformed-shape": "Deformada", "bending-moment": "Momento fletor", shear: "Cortante",
  axial: "Axial", reaction: "Reações", verification: "Verificação (utilização)",
};

type SupportStatus = "exceeds-declared-capacity" | "capacity-pending" | "within-declared-capacity";
const supportText: Record<SupportStatus, string> = {
  "exceeds-declared-capacity": "excede a capacidade declarada",
  "capacity-pending": "capacidade pendente",
  "within-declared-capacity": "dentro da capacidade declarada",
};
const supportTone: Record<SupportStatus, Viewer3DLabel["tone"]> = { "exceeds-declared-capacity": "danger", "capacity-pending": "warn", "within-declared-capacity": "ok" };

/** Apoios auditados na combinação ativa (o relatório traz um registro por nó e combinação). */
export function activeSupports(analysis: StudioAnalysis) {
  if (analysis.state !== "current" || !analysis.resistance) return [];
  return analysis.resistance.supportAudits.filter(a => a.combinationId === analysis.combo).map(a => ({
    nodeId: a.nodeId, status: a.status as SupportStatus,
    upliftKn: a.checks.find(c => c.action === "upliftKn")?.demandKn ?? null,
  }));
}

/** Cores, deformada e rótulos que o estúdio desenha no 3D principal (somente da análise atual do projeto). */
export function useStudioResultView(model: StructureModel | null, selectedPiece: string, selectedNode: string, showLabels: boolean) {
  const { analysis } = useStudioAnalysis();
  return useMemo(() => {
    const layer = analysis.state === "current" && analysis.layer && !analysis.layer.refused ? analysis.layer : null;
    const labels: Viewer3DLabel[] = [];
    if (showLabels && model) {
      const piece = model.pieces.find(p => p.id === selectedPiece);
      if (piece) labels.push({ key: `p-${piece.id}`, pieceId: piece.id, text: `${piece.id} · ${formatMeasure(piece.lengthMm / 1000, 2)} m` });
      if (selectedNode) labels.push({ key: `n-${selectedNode}`, nodeId: selectedNode, text: `Nó ${selectedNode}` });
      for (const s of activeSupports(analysis)) labels.push({ key: `s-${s.nodeId}`, nodeId: s.nodeId, text: `${s.nodeId} · ${s.status === "within-declared-capacity" ? "ok" : s.status === "capacity-pending" ? "pendente" : "excede"}`, tone: supportTone[s.status] });
    }
    return {
      colors: layer?.colors ?? undefined,
      deformed: layer?.kind === "deformed-shape" ? layer.segments : null,
      labels,
    };
  }, [analysis, model, selectedPiece, selectedNode, showLabels]);
}

/** Gradiente igual ao de overlayColors (azul → oliva → vermelho). */
const gradient = "linear-gradient(90deg, rgb(64,107,145), rgb(139,150,92), rgb(214,60,40))";

export function StudioResultsBar({ onSelectNode, onOpenAnalysis, showLabels, onShowLabels }: {
  onSelectNode: (id: string) => void; onOpenAnalysis: () => void; showLabels: boolean; onShowLabels: (value: boolean) => void;
}) {
  const { analysis, commands } = useStudioAnalysis();
  const [animating, setAnimating] = useState(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const supports = activeSupports(analysis);
  if (analysis.state === "unavailable" || analysis.state === "idle") return <div className="studio-results studio-results--empty" data-testid="studio-results">
    <span>Sem resultados no 3D.</span>
    <button type="button" className="ui-button ui-button-ghost ui-button-sm" onClick={onOpenAnalysis}>Ir para a análise</button>
  </div>;
  if (analysis.state === "running") return <div className="studio-results" data-testid="studio-results" role="status">Análise em execução… os resultados aparecem aqui ao terminar.</div>;
  if (analysis.state === "stale" || analysis.state === "error") return <div className="studio-results studio-results--warn" data-testid="studio-results" role="status">
    <AlertTriangle size={16} aria-hidden="true" />{analysis.state === "stale" ? "Resultado desatualizado: a obra mudou depois da análise. Recalcule para ver cores e esforços." : "A última análise falhou; nenhum resultado é mostrado no 3D."}
  </div>;

  const layer = analysis.layer, legend = layer && !layer.refused && layer.colors ? layer.legend : null;
  const target = Number((analysis.scaleInput || String(layer?.scale ?? 1)).replace(",", "."));
  function animate() {
    if (!Number.isFinite(target) || target <= 0) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const original = analysis.scaleInput;
    if (reduce) { commands.setScale(String(target)); return; }
    cancelAnimationFrame(frame.current); setAnimating(true);
    const start = performance.now(), duration = 1200;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
      commands.setScale(String(Math.max(0, Math.round(target * eased * 100) / 100)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else { commands.setScale(original); setAnimating(false); }
    };
    frame.current = requestAnimationFrame(tick);
  }
  return <div className="studio-results" data-testid="studio-results">
    <div className="studio-results-row">
      <label className="studio-results-field">Combinação exibida
        <select className="input" value={analysis.combo} onChange={e => commands.setCombo(e.target.value)}>{analysis.combinations.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </label>
      <label className="studio-results-field">Camada no 3D do estúdio
        <select className="input" value={analysis.layerKind} onChange={e => commands.setLayerKind(e.target.value as ResultOverlayKind | "none")}>
          <option value="none">Sem camada (cores do modelo)</option>
          {resultOverlayKinds.map(k => <option key={k} value={k}>{layerLabels[k]}</option>)}
        </select>
      </label>
      <label className="studio-results-check"><input type="checkbox" checked={showLabels} onChange={e => onShowLabels(e.target.checked)} />Rótulos no 3D</label>
    </div>
    {analysis.layerKind === "deformed-shape" && layer && !layer.refused && <div className="studio-results-row">
      <label className="studio-results-field">Escala da deformada (×)
        <input className="input" inputMode="decimal" value={analysis.scaleInput} placeholder={`auto ${formatMeasure(layer.scale, 0)}`} onChange={e => commands.setScale(e.target.value)} />
      </label>
      <button type="button" className="ui-button ui-button-secondary ui-button-sm" disabled={animating} onClick={animate}><Play size={14} aria-hidden="true" />{animating ? "Animando…" : "Animar deformada"}</button>
      <span className="field-hint">Escala só visual; não altera deslocamentos.</span>
    </div>}
    {layer?.refused && <p className="studio-results-note" role="status"><AlertTriangle size={14} aria-hidden="true" /> Camada recusada pela checagem de rastreabilidade ({layer.refused.length} {layer.refused.length === 1 ? "motivo" : "motivos"}); detalhes na Análise Estrutural Experimental.</p>}
    {legend && <figure className="studio-legend" data-testid="studio-legend">
      <div className="studio-legend-bar" role="img" style={{ background: gradient }}
        aria-label={`Escala de cores de ${layerLabels[layer!.kind]}: azul = ${formatMeasure(legend.min, 3)} ${legend.units} (menor valor absoluto) até vermelho = ${formatMeasure(legend.max, 3)} ${legend.units} (maior). Combinação ${analysis.combo}.`} />
      <figcaption><span>{formatMeasure(legend.min, 3)}</span><span>{layerLabels[layer!.kind]} · {legend.units} · {analysis.combo}</span><span>{formatMeasure(legend.max, 3)}</span></figcaption>
    </figure>}
    {supports.length > 0 && <div className="studio-supports" data-testid="studio-supports">
      <span className="studio-results-caption">Apoios · {analysis.combo}</span>
      <ul>{supports.map(s => <li key={s.nodeId}><button type="button" className={`studio-support studio-support--${supportTone[s.status]}`} onClick={() => onSelectNode(s.nodeId)}
        aria-label={`Apoio ${s.nodeId}: ${supportText[s.status]}; arrancamento ${s.upliftKn === null ? "pendente" : `${formatMeasure(s.upliftKn, 2)} kN`}`}>
        {s.status === "within-declared-capacity" ? <CheckCircle2 size={14} aria-hidden="true" /> : s.status === "capacity-pending" ? <CircleDashed size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
        {s.nodeId}<small>{s.upliftKn === null ? "pendente" : `${formatMeasure(s.upliftKn, 1)} kN`}</small>
      </button></li>)}</ul>
    </div>}
  </div>;
}
