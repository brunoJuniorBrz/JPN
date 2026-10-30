"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Project } from "@/domain/models";
import type { StructureResult } from "@/domain/structure";
import { roleLabels } from "@/domain/structure";
import { resolveSection, sectionOrientation } from "@/domain/profile-section";
import { structureViews } from "@/domain/calculations/structure";
import { DrawingCanvas } from "@/components/geometry/roof-preview";
import { formatMeasure } from "@/domain/calculations/units";
import { Field, Select } from "@/components/ui";
import type { ViewName } from "@/domain/calculations/geometry";
const Structure3D = dynamic(() => import("./structure-3d").then(m => m.Structure3D), { ssr: false, loading: () => <p role="status">Carregando visualização 3D…</p> });

export function StructurePreview({ project, result }: { project: Project; result: StructureResult }) {
  const [view, setView] = useState<ViewName>("plan"), [detail, setDetail] = useState(false), [selected, setSelected] = useState("");
  const [three, setThree] = useState(false), [dimensions, setDimensions] = useState(true);
  const model = useMemo(() => structureViews(project, result, detail), [project, result, detail]);
  if (!model || !result.model) return null;
  const selectedPiece = result.model.pieces.find(p => p.id === selected);
  const selectedSection = selectedPiece ? resolveSection(selectedPiece.profile) : null;
  return <section className="drawing-panel" aria-label="Estrutura gerada"><div className="drawing-heading"><h3>Peças da estrutura</h3><span>Geometria em mm</span></div>
    <div className="view-switch">{([["plan", "De cima"], ["front", "De frente"], ["side", "De lado"]] as const).map(([key, label]) => <button key={key} type="button" className={!detail && view === key ? "selected" : ""} onClick={() => { setThree(false); setDetail(false); setView(key); }}>{label}</button>)}<button type="button" className={detail ? "selected" : ""} onClick={() => { setThree(false); setDetail(true); setView(project.roof.fall.startsWith("width") ? "front" : "side"); }}>Uma tesoura</button></div>
    <div className="actions"><button type="button" className="button secondary" aria-pressed={three} onClick={() => setThree(v => !v)}>{three ? "Voltar às vistas 2D" : "Visualizar em 3D"}</button><label className="checkbox-label"><input type="checkbox" checked={dimensions} onChange={e => setDimensions(e.target.checked)} />Mostrar cotas 2D</label></div>
    {three ? <Structure3D model={result.model} selected={selected} onSelect={setSelected} /> : <DrawingCanvas key={`${view}-${detail}`} model={{ ...model, views: { ...model.views, [view]: { ...model.views[view], entities: model.views[view].entities.filter(e => dimensions || e.layer !== "COTAS") } } }} view={view} selected={selected} onSelect={setSelected} />}
    <p className="drawing-help">Toque em uma barra ou selecione abaixo. Arraste para mover e use dois dedos para ampliar. Marrom: pilares · azul: terças · verde: tesouras.</p>
    <Field label="Selecionar peça no desenho"><Select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Escolha uma peça</option>{result.model.pieces.filter(p => !detail || p.id.startsWith("T1-")).map(p => <option key={p.id} value={p.id}>{p.id} · {roleLabels[p.role]} · {formatMeasure(p.lengthMm / 1000)} m</option>)}</Select></Field>
    {selectedPiece && <div className="notice" role="status"><strong>{selectedPiece.id}</strong> · {roleLabels[selectedPiece.role]} · {selectedPiece.profile.name || "Perfil não definido"} · {formatMeasure(selectedPiece.lengthMm / 1000)} m entre eixos · {selectedPiece.massKg === null ? "Massa pendente" : `${formatMeasure(selectedPiece.massKg)} kg`}<p>{selectedSection?.dimensions}</p><p>{selectedSection?.warning || "Seção ideal prismática; sem raios ou filetes presumidos."}</p><p>{sectionOrientation(selectedPiece.profile)}</p></div>}
    <p className="preliminary-banner">GEOMETRIA PRELIMINAR · RESISTÊNCIA AINDA NÃO VERIFICADA</p>
    {selectedPiece && <p className="field-hint">Peças equivalentes neste grupo: {result.model.groups.find(g => g.pieceIds.includes(selectedPiece.id))?.pieceIds.length ?? 1}. Fonte do perfil: {selectedPiece.profile.source || "Pendente"}.</p>}
  </section>;
}
