"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Project } from "@/domain/models";
import type { PieceRole, StructureResult } from "@/domain/structure";
import { roleLabels } from "@/domain/structure";
import { resolveSection, sectionOrientation } from "@/domain/profile-section";
import { structureViews } from "@/domain/calculations/structure";
import { DrawingCanvas } from "@/components/geometry/roof-preview";
import { formatMeasure } from "@/domain/calculations/units";
import { Field, Select } from "@/components/ui";
import type { ViewName } from "@/domain/calculations/geometry";
import { profiles3DDemo } from "@/domain/profiles-3d-demo";
const Structure3D = dynamic(() => import("./structure-3d").then(m => m.Structure3D), { ssr: false, loading: () => <p role="status">Carregando visualização 3D…</p> });

export function StructurePreview({ project, result, onConfigureProfile, onEditStructure, startIn3D = false }: { project: Project; result: StructureResult; onConfigureProfile?: (role: PieceRole) => void; onEditStructure?: () => void; startIn3D?: boolean }) {
  const [view, setView] = useState<ViewName>("plan"), [detail, setDetail] = useState(false), [selected, setSelected] = useState("");
  const [three, setThree] = useState(startIn3D), [dimensions, setDimensions] = useState(true);
  const [demo, setDemo] = useState(false);
  const activeModel = useMemo(() => demo && three ? profiles3DDemo(project) : result.model, [demo, three, project, result.model]);
  const model = useMemo(() => structureViews(project, result, detail), [project, result, detail]);
  if (!model || !result.model) return null;
  const selectedPiece = activeModel!.pieces.find(p => p.id === selected);
  const selectedSection = selectedPiece ? resolveSection(selectedPiece.profile) : null;
  return <section id="jpn-viewer" className="drawing-panel" aria-label="Estrutura gerada"><div className="drawing-heading"><h3>Peças da estrutura</h3><span>Geometria em mm</span></div>
    {onEditStructure && <div className="actions"><button type="button" className="button secondary" onClick={onEditStructure}>Editar distribuição e espaçamentos</button></div>}
    <div className={three ? "view-switch viewer-switch--3d" : "view-switch"}>
      {!three && ([[ "plan", "De cima"], ["front", "De frente"], ["side", "De lado"]] as const).map(([key, label]) => <button key={key} type="button" className={!detail && view === key ? "selected" : ""} onClick={() => { setThree(false); setDetail(false); setView(key); }}>{label}</button>)}
      {!three && <button type="button" className={detail ? "selected" : ""} onClick={() => { setThree(false); setDetail(true); setView(project.roof.fall.startsWith("width") ? "front" : "side"); }}>Uma tesoura</button>}
      <button type="button" className={three ? "selected" : ""} aria-pressed={three} onClick={() => { if (three) setDemo(false); else setDetail(false); setSelected(""); setThree(!three); }}>{three ? "Voltar às vistas 2D" : "Visualizar em 3D"}</button>
    </div>
    {!three && <div className="actions"><label className="checkbox-label"><input type="checkbox" checked={dimensions} onChange={e => setDimensions(e.target.checked)} />Mostrar cotas 2D</label></div>}
    {three && demo && <div className="notice" data-testid="profile-demo-notice"><strong>DEMONSTRAÇÃO VISUAL · DIMENSÕES SINTÉTICAS</strong><p>Este modelo mostra perfis completos. Seu projeto e seus quantitativos permanecem preservados.</p><button type="button" className="button secondary" onClick={() => { setDemo(false); setSelected(""); }}>Voltar ao meu projeto</button></div>}
    {three ? <Structure3D key={demo ? "demo" : "project"} model={activeModel!} roof={project.roof} planning={project.planning} projectName={project.name} selected={selected} onSelect={setSelected} onDemonstrate={demo ? undefined : () => { setDemo(true); setDetail(false); setSelected(""); }} onConfigureProfile={!demo && onConfigureProfile ? () => onConfigureProfile(selectedPiece?.role ?? result.model!.pieces.find(p => !resolveSection(p.profile).section)?.role ?? "column") : undefined} /> : <DrawingCanvas key={`${view}-${detail}`} model={{ ...model, views: { ...model.views, [view]: { ...model.views[view], entities: model.views[view].entities.filter(e => dimensions || e.layer !== "COTAS") } } }} view={view} selected={selected} onSelect={setSelected} />}
    {!three && <p className="drawing-help">Toque em uma barra ou selecione abaixo. Arraste para mover e use dois dedos para ampliar. Marrom: pilares · azul: terças · verde: tesouras.</p>}
    <Field label="Selecionar peça no desenho"><Select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Escolha uma peça</option>{(three ? activeModel! : result.model).pieces.filter(p => !detail || p.id.startsWith("T1-")).map(p => <option key={p.id} value={p.id}>{p.id} · {roleLabels[p.role]} · {formatMeasure(p.lengthMm / 1000)} m</option>)}</Select></Field>
    {selectedPiece && <div className="notice" role="status"><strong>{selectedPiece.id}</strong> · {roleLabels[selectedPiece.role]} · {selectedPiece.profile.name || "Perfil não definido"} · {formatMeasure(selectedPiece.lengthMm / 1000)} m entre eixos · {selectedPiece.massKg === null ? "Massa pendente" : `${formatMeasure(selectedPiece.massKg)} kg`}<p>{selectedSection?.dimensions}</p><p>{selectedSection?.warning || "Seção ideal prismática; sem raios ou filetes presumidos."}</p><p>{sectionOrientation(selectedPiece.profile)}</p>{!demo && onConfigureProfile && <button type="button" className="button secondary" onClick={() => onConfigureProfile(selectedPiece.role)}>Editar perfil deste grupo</button>}</div>}
    <p className="preliminary-banner">GEOMETRIA PRELIMINAR · RESISTÊNCIA AINDA NÃO VERIFICADA</p>
    {selectedPiece && <p className="field-hint">Peças equivalentes neste grupo: {activeModel!.groups.find(g => g.pieceIds.includes(selectedPiece.id))?.pieceIds.length ?? 1}. Fonte do perfil: {selectedPiece.profile.source || "Pendente"}.</p>}
  </section>;
}
