"use client";
import { useMemo,useState } from "react";
import type { Project } from "@/domain/models";
import { distributeRoofActions } from "@/domain/roof-load-path";
import { structureSignature } from "@/domain/calculations/project-basis";

export function RoofLoadPathPanel({project,onChange,onSelectPiece}:{project:Project;onChange:(patch:Partial<Project>)=>void;onSelectPiece?:(id:string)=>void}){
  const [message,setMessage]=useState("");
  const preview=useMemo(()=>{
    const loading=project.workspace.spatialPreparation?.loading;
    if(!loading?.roofArea.length)return {error:"Nenhuma ação por área registrada."};
    try{return {trace:distributeRoofActions(project,loading.roofArea,loading.roofDistribution)};}catch(e){return {error:(e as Error).message};}
  },[project]);
  return <div className="notice" data-testid="roof-load-path">
    <p>Faixas tributárias: uma ou duas águas retangulares do gerador, terças paralelas e bordas apoiadas nas terças extremas. Regiões compostas permanecem preliminares. A associação geométrica não declara apoios, materiais nem ligações físicas.</p>
    <p>A superfície carregada coincide com os eixos das terças neste modelo. Excentricidades do telhamento, balanços transversais, recortes e faixas parcialmente carregadas exigem outro modelo e não são automatizados aqui.</p>
    <button type="button" className="button secondary" disabled={!project.workspace.spatialPreparation?.loading?.roofArea.length} onClick={()=>{
      try{
        const d=project.workspace.spatialPreparation!,loading=d.loading!;
        const roofDistribution={version:1 as const,method:"parallel-purlin-strips" as const,geometrySignature:structureSignature(project)};
        distributeRoofActions(project,loading.roofArea,roofDistribution);
        onChange({workspace:{...project.workspace,spatialPreparation:{...d,loading:{...loading,roofDistribution}}}});
        setMessage("Associação registrada para esta geometria. Revise casos, combinações e eventuais duplicidades antes da análise.");
      }catch(e){setMessage((e as Error).message);}
    }}>Vincular áreas às terças desta geometria</button>
    {preview.error&&<p>{preview.error}</p>}
    {preview.trace&&<>
      <p>{preview.trace.regions.regions.length} superfícies associadas; forças transmitidas pelo próprio modelo, sem somar reações manualmente.</p>
      {preview.trace.actions.map(a=><details key={a.actionId}><summary>{a.actionId} · {a.action.caseId} · {a.areaM2.toFixed(5)} m² ({a.action.projection})</summary>
        <p>Fonte: {a.action.source} · revisão {a.action.revision}. Caminho declarado: {a.action.loadPath}.</p>
        <p data-testid="roof-conservation">Resultante XYZ (N): {a.distributedForceN.map(x=>x.toPrecision(7)).join("; ")}. Momento global XYZ (N·m): {a.distributedMomentNm.map(x=>x.toPrecision(7)).join("; ")}. Área distribuída: {a.distributedAreaM2.toFixed(5)} m².</p>
        <ul>{a.contributions.map(c=><li key={`${c.regionId}:${c.pieceId}`}><button type="button" className="button secondary" onClick={()=>onSelectPiece?.(c.pieceId)}>Ver {c.pieceId}</button> {c.regionId} · faixa {c.widthProjectedM.toFixed(5)} m em projeção · {c.effectiveAreaM2.toFixed(5)} m² · XYZ {c.forcePerLengthNM.map(x=>(x/1000).toPrecision(6)).join("; ")} kN/m</li>)}</ul>
      </details>)}
    </>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
