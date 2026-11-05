"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { roofOutlineSchema,roofOutlineAreaM2,type RoofOutline } from "@/domain/roof-outline";
import { Field,Input,Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";

export function RoofOutlinePanel({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
  const [draft,setDraft]=useState<RoofOutline>(()=>structuredClone(project.workspace.roofOutline??{schema_version:"jpn.roof-outline/1",units:"mm",projection:"horizontal-XY",source:"",revision:"",outer:[],holes:[],supportPieceIds:[]}));
  const [ringIndex,setRingIndex]=useState(0),[x,setX]=useState<number|null>(null),[y,setY]=useState<number|null>(null),[error,setError]=useState("");
  const ring=ringIndex===0?draft.outer:draft.holes[ringIndex-1],valid=roofOutlineSchema.safeParse(draft);
  const replace=(points:[number,number][])=>setDraft(ringIndex===0?{...draft,outer:points}:{...draft,holes:draft.holes.map((h,i)=>i===ringIndex-1?points:h)});
  const flat=[draft.outer,...draft.holes].flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]);
  const x0=Math.min(0,...xs),y0=Math.min(0,...ys),spanX=Math.max(1,...xs)-x0,spanY=Math.max(1,...ys)-y0;
  return <details className="technical-details" data-testid="roof-outline"><summary>Contorno de telhamento e recortes — independente das barras</summary>
    <p>Projeção horizontal XY em mm. Contorno anti-horário e recortes horários, explicitamente fechados. Área líquida não é o retângulo envolvente, nem a área inclinada ou quantidade de telhas. Não gera barras, apoios ou cargas.</p>
    <div className="form-grid"><Field label="Fonte do contorno"><Input value={draft.source} onChange={e=>setDraft({...draft,source:e.target.value})}/></Field><Field label="Revisão do contorno"><Input value={draft.revision} onChange={e=>setDraft({...draft,revision:e.target.value})}/></Field>
      <Field label="Polígono para editar"><Select value={ringIndex} onChange={e=>setRingIndex(Number(e.target.value))}><option value={0}>Contorno externo</option>{draft.holes.map((_,i)=><option key={i} value={i+1}>Recorte {i+1}</option>)}</Select></Field>
      <NumberField label="Ponto do contorno X (mm)" value={x} min={-10000000} max={10000000} onChange={setX}/><NumberField label="Ponto do contorno Y (mm)" value={y} min={-10000000} max={10000000} onChange={setY}/></div>
    <div className="actions"><button type="button" className="button secondary" onClick={()=>{if(x===null||y===null){setError("Informe X e Y.");return;}replace([...ring,[x,y]]);setX(null);setY(null);setError("");}}>Adicionar ponto ao polígono</button>
      <button type="button" className="button secondary" disabled={ring.length<3} onClick={()=>replace([...ring,[...ring[0]]])}>Fechar polígono</button><button type="button" className="button secondary" onClick={()=>replace([...ring].reverse())}>Inverter orientação do polígono</button>
      <button type="button" className="button secondary" onClick={()=>replace(ring.slice(0,-1))}>Remover último ponto</button><button type="button" className="button secondary" disabled={draft.holes.length>=10} onClick={()=>{setDraft({...draft,holes:[...draft.holes,[]]});setRingIndex(draft.holes.length+1);}}>Adicionar recorte</button>
      {ringIndex>0&&<button type="button" className="button secondary" onClick={()=>{setDraft({...draft,holes:draft.holes.filter((_,i)=>i!==ringIndex-1)});setRingIndex(0);}}>Remover recorte selecionado</button>}</div>
    <p>{ring.map(p=>`(${p[0]}; ${p[1]})`).join(" → ")||"Polígono sem pontos"}</p>
    {flat.length>0&&<svg viewBox={`${x0-100} ${y0-100} ${spanX+200} ${spanY+200}`} className="physical-line-svg" role="img" aria-label="Contorno horizontal com recortes"><path d={[draft.outer,...draft.holes].filter(r=>r.length).map(r=>"M "+r.map(p=>p.join(",")).join(" L ")+" Z").join(" ")} fill="#d6e4df" fillRule="evenodd" stroke="#315b69" strokeWidth={Math.max(spanX,spanY)/250}/></svg>}
    <p data-testid="roof-outline-area">{valid.success?`Área horizontal líquida declarada: ${roofOutlineAreaM2(valid.data)} m².`:"Contorno pendente ou inválido; nenhuma área calculada."}</p>
    <details><summary>Associação declarada às barras (não comprova transmissão)</summary>{project.workspace.physicalStructure?.pieces.map(p=><label key={p.id} className="checkbox-label"><input type="checkbox" checked={draft.supportPieceIds.includes(p.id)} onChange={e=>setDraft({...draft,supportPieceIds:e.target.checked?[...draft.supportPieceIds,p.id]:draft.supportPieceIds.filter(id=>id!==p.id)})}/>{p.id}</label>)}</details>
    <button type="button" className="button" onClick={()=>{try{const value=roofOutlineSchema.parse(draft);if(value.supportPieceIds.some(id=>!project.workspace.physicalStructure?.pieces.some(p=>p.id===id)))throw Error("Associação do contorno refere barra ausente.");onChange({workspace:{...project.workspace,roofOutline:value}});setError("");}catch(e){setError((e as Error).message);}}}>Registrar contorno validado</button>
    <p>As associações acima são referências geométricas declaradas. Cargas por área e vento continuam bloqueados até validação específica do caminho físico. Não preencher o desenho incompleto do Tom com coordenadas supostas.</p>
    {error&&<p role="alert">{error}</p>}
  </details>;
}
