"use client";
import { useMemo,useState } from "react";
import type { Project } from "@/domain/models";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { mixedPreparationReview } from "@/domain/mixed-adapter";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { downloadText } from "@/lib/format";
import { PhysicalLineView } from "./physical-line-view";
import type { ResultSection } from "./takeoff-summary";

export function DeclaredModelSummary({project,activeSection,onSectionChange}:{project:Project;activeSection:ResultSection;onSectionChange:(section:ResultSection)=>void}){
  const {model,draft,review}=useMemo(()=>{const model=resolvePhysicalStructure(project).model!,draft=project.workspace.spatialPreparation??newSpatialPreparation(project);return {model,draft,review:mixedPreparationReview(project,draft)};},[project]);
  const [piece,setPiece]=useState(""),[node,setNode]=useState("");
  const sections:[[ResultSection,string],[ResultSection,string],[ResultSection,string],[ResultSection,string]]=[["model","Modelo 3D"],["materials","Materiais"],["engineering","Engenharia"],["files","Arquivos"]];
  return <section className="result-workspace" aria-label="Resultado do modelo declarado"><h2>Estrutura física declarada</h2>
    <p>{model.nodes.length} nós · {model.pieces.length} barras · revisão {project.workspace.physicalStructure!.revision} · {review.issues.length?"Dados físicos pendentes":"Modelo válido para preparar a análise"}.</p>
    <p className="result-permanent-warning" data-testid="result-safety-warning">Análise experimental disponível no domínio suportado. Verificações normativas incompletas · fabricação bloqueada.</p>
    <nav className="result-section-tabs" role="tablist" aria-label="Áreas do resultado">{sections.map(([id,label],i)=><button key={id} role="tab" type="button" id={`result-tab-${id}`} aria-controls={`result-panel-${id}`} aria-selected={activeSection===id} tabIndex={activeSection===id?0:-1} onClick={()=>onSectionChange(id)} onKeyDown={e=>{const index=e.key==="ArrowRight"?(i+1)%4:e.key==="ArrowLeft"?(i+3)%4:e.key==="Home"?0:e.key==="End"?3:-1;if(index<0)return;e.preventDefault();onSectionChange(sections[index][0]);document.getElementById(`result-tab-${sections[index][0]}`)?.focus();}}>{label}</button>)}</nav>
    <div id="result-panel-model" role="tabpanel" aria-labelledby="result-tab-model" hidden={activeSection!=="model"}><PhysicalLineView model={model} selected={piece} onSelect={setPiece} selectedNodeId={node} onSelectNode={setNode}/></div>
    <div id="result-panel-materials" role="tabpanel" aria-labelledby="result-tab-materials" hidden={activeSection!=="materials"}><h3>Referências físicas cadastradas</h3><p>Seções de cálculo independentes de perfis visuais. Nenhum quantitativo de cobertura ou plano de corte é inferido.</p><ul>{draft.physicalCatalog?.assignments.map(a=><li key={a.pieceId}>{a.pieceId} → material {a.materialId} · seção {a.sectionId}</li>)}</ul></div>
    <div id="result-panel-engineering" role="tabpanel" aria-labelledby="result-tab-engineering" hidden={activeSection!=="engineering"}><h3>Preparação, análise e resultados</h3><p>Use a análise mista abaixo para conferir os dados e executar o projeto salvo. Cargas nodais explícitas; peso próprio, vento e cobertura automáticos permanecem bloqueados.</p></div>
    <div id="result-panel-files" role="tabpanel" aria-labelledby="result-tab-files" hidden={activeSection!=="files"}><button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify(project,null,2),"jpn-modelo-estrutural.json")}>Exportar modelo estrutural JSON</button><p>O arquivo conserva a declaração e suas referências. Relatórios de cálculo são exportados após uma análise válida.</p></div>
  </section>;
}
