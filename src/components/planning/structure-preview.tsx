"use client";
import { useMemo, useState } from "react";
import type { Project } from "@/domain/models";
import type { StructureResult } from "@/domain/structure";
import { roleLabels } from "@/domain/structure";
import { structureViews } from "@/domain/calculations/structure";
import { DrawingCanvas } from "@/components/geometry/roof-preview";
import { formatMeasure } from "@/domain/calculations/units";
import { Field, Select } from "@/components/ui";
import type { ViewName } from "@/domain/calculations/geometry";

export function StructurePreview({ project, result }: { project: Project; result: StructureResult }) {
  const [view, setView] = useState<ViewName>("plan"), [detail, setDetail] = useState(false), [selected, setSelected] = useState("");
  const model = useMemo(() => structureViews(project, result, detail), [project, result, detail]);
  if (!model || !result.model) return null;
  const selectedPiece = result.model.pieces.find(p => p.id === selected);
  return <section className="drawing-panel" aria-label="Estrutura gerada"><div className="drawing-heading"><h3>Peças da estrutura</h3><span>Geometria em mm</span></div>
    <div className="view-switch">{([["plan", "De cima"], ["front", "De frente"], ["side", "De lado"]] as const).map(([key, label]) => <button key={key} type="button" className={!detail && view === key ? "selected" : ""} onClick={() => { setDetail(false); setView(key); }}>{label}</button>)}<button type="button" className={detail ? "selected" : ""} onClick={() => { setDetail(true); setView(project.roof.fall.startsWith("width") ? "front" : "side"); }}>Uma tesoura</button></div>
    <DrawingCanvas key={`${view}-${detail}`} model={model} view={view} selected={selected} onSelect={setSelected} />
    <p className="drawing-help">Toque em uma barra ou selecione abaixo. Arraste para mover e use dois dedos para ampliar. Marrom: pilares · azul: terças · verde: tesouras.</p>
    <Field label="Selecionar peça no desenho"><Select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Escolha uma peça</option>{result.model.pieces.filter(p => !detail || p.id.startsWith("T1-")).map(p => <option key={p.id} value={p.id}>{p.id} · {roleLabels[p.role]} · {formatMeasure(p.lengthMm / 1000)} m</option>)}</Select></Field>
    {selectedPiece && <p className="notice" role="status"><strong>{selectedPiece.id}</strong> · {selectedPiece.profile.name || "Perfil não definido"} · {formatMeasure(selectedPiece.lengthMm / 1000)} m entre eixos · {selectedPiece.massKg === null ? "Massa pendente" : `${formatMeasure(selectedPiece.massKg)} kg`}</p>}
    <p className="preliminary-banner">GEOMETRIA PRELIMINAR · RESISTÊNCIA AINDA NÃO VERIFICADA</p>
  </section>;
}
