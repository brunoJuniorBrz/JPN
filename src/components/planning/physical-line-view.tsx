"use client";
import { useMemo,useState } from "react";
import type { PhysicalGeometry } from "@/domain/structure";
import { roleLabels } from "@/domain/structure";
import { calculateNodeMeasurement } from "./node-measurement";
import { Field,Select } from "@/components/ui";

/** Orthographic views of the declared coordinates. No roof envelope or visual solid is fabricated. */
export function PhysicalLineView({model,selected="",onSelect=()=>{},selectedNodeId="",onSelectNode=()=>{},analysisColors}:{model:PhysicalGeometry;selected?:string;onSelect?:(id:string)=>void;selectedNodeId?:string;onSelectNode?:(id:string)=>void;analysisColors?:Record<string,number>}){
  const [view,setView]=useState("iso"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const points=useMemo(()=>{
    const projected=model.nodes.map(n=>({node:n,u:view==="top"||view==="front"?n.x:view==="side"?n.y:(n.x-n.y)*Math.cos(Math.PI/6),
      v:view==="top"?-n.y:view==="front"||view==="side"?-n.z:(n.x+n.y)*.5-n.z}));
    const x0=Math.min(...projected.map(p=>p.u)),y0=Math.min(...projected.map(p=>p.v));
    const scale=Math.min(680/Math.max(1,...projected.map(p=>p.u-x0)),340/Math.max(1,...projected.map(p=>p.v-y0)));
    return new Map(projected.map(p=>[p.node.id,{...p,x:60+(p.u-x0)*scale,y:40+(p.v-y0)*scale}]));
  },[model,view]);
  const measurement=calculateNodeMeasurement(model.nodes,[from,to]);
  return <section className="physical-line-view" data-testid="declared-line-view" aria-label="Modelo físico de linhas">
    <p>Modelo de linhas · coordenadas declaradas em mm · {model.nodes.length} nós e {model.pieces.length} barras. Sem sólidos ou seções visuais presumidos.</p>
    <div className="actions" aria-label="Vistas do modelo declarado">{[["iso","Isométrica 3D"],["top","Superior"],["front","Frontal"],["side","Lateral"]].map(([id,label])=><button type="button" className="button secondary" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>
    <svg viewBox="0 0 800 440" role="img" aria-label="Nós e barras da estrutura declarada" className="physical-line-svg">
      {model.pieces.map(piece=>{const a=points.get(piece.start)!,b=points.get(piece.end)!;return <g key={piece.id} data-piece-id={piece.id} data-start={piece.start} data-end={piece.end}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected===piece.id?"#bd4c27":analysisColors?.[piece.id]!==undefined?`#${analysisColors[piece.id].toString(16).padStart(6,"0")}`:"#315b69"} strokeWidth={selected===piece.id?6:3}/>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={20} onClick={()=>onSelect(piece.id)}/>
        <text x={(a.x+b.x)/2+8} y={(a.y+b.y)/2-8} fontSize={13}>{piece.id}</text>
      </g>;})}
      {model.nodes.map(n=>{const p=points.get(n.id)!;return <g key={n.id} data-node-id={n.id} data-x-mm={n.x} data-y-mm={n.y} data-z-mm={n.z} onClick={()=>onSelectNode(n.id)}>
        <circle cx={p.x} cy={p.y} r={selectedNodeId===n.id?8:5} fill={selectedNodeId===n.id?"#bd4c27":"#223b47"}/><text x={p.x+10} y={p.y+18} fontSize={14}>{n.id}</text>
      </g>;})}
    </svg>
    <div className="form-grid"><Field label="Barra do modelo declarado"><Select value={selected} onChange={e=>onSelect(e.target.value)}><option value="">Selecionar barra</option>{model.pieces.map(p=><option key={p.id} value={p.id}>{p.id} · {roleLabels[p.role]}</option>)}</Select></Field>
      <Field label="Nó do modelo declarado"><Select value={selectedNodeId} onChange={e=>onSelectNode(e.target.value)}><option value="">Selecionar nó</option>{model.nodes.map(n=><option key={n.id} value={n.id}>{n.id} · ({n.x}; {n.y}; {n.z}) mm</option>)}</Select></Field></div>
    <details className="technical-details"><summary>Medir entre nós declarados</summary><div className="form-grid"><Field label="Nó inicial da medida declarada"><Select value={from} onChange={e=>setFrom(e.target.value)}><option value="">Selecionar</option>{model.nodes.map(n=><option key={n.id}>{n.id}</option>)}</Select></Field><Field label="Nó final da medida declarada"><Select value={to} onChange={e=>setTo(e.target.value)}><option value="">Selecionar</option>{model.nodes.filter(n=>n.id!==from).map(n=><option key={n.id}>{n.id}</option>)}</Select></Field></div>{measurement&&<p role="status">{measurement.from} → {measurement.to}: {measurement.lengthMm.toLocaleString("pt-BR")} mm · ΔX {measurement.dxMm} · ΔY {measurement.dyMm} · ΔZ {measurement.dzMm} mm. Medida geométrica, sem aprovação.</p>}</details>
  </section>;
}
