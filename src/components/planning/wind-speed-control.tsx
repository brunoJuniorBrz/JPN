"use client";
import { useMemo,useState } from "react";
import type { Project } from "@/domain/models";
import type { WindDeclaration } from "@/domain/wind-contracts";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { calculateWindSpeed } from "@/domain/wind-speed";
import { applyWindSpeed } from "@/domain/apply-wind-speed";
import { Field,Input,Select } from "@/components/ui";

type Props={project:Project;onChange:(p:Partial<Project>)=>void};
export function WindSpeedControl(props:Props){
  const [id,setId]=useState(""),wind=props.project.workspace.spatialPreparation?.loading?.wind;
  if(!wind)return null;
  const current=wind.cases.find(c=>c.id===id);
  return <details data-testid="wind-speed-control"><summary>Calcular S2, velocidade característica e pressão dinâmica</summary>
    <p>NBR 6123:2023, edição original consultada. Escopo: terreno plano ou fracamente acidentado, sem transição de rugosidade. Categoria, classe dimensional e S3 exigem classificação e fonte do responsável; V0 vem da declaração existente da obra. Isopletas, cpe/cpi, efeitos dinâmicos e correções posteriores não são homologados por este cálculo parcial.</p>
    <Field label="Caso para calcular pressão dinâmica"><Select value={id} onChange={e=>setId(e.target.value)}><option value="">Selecione</option>{wind.cases.map(c=><option key={c.id}>{c.id}</option>)}</Select></Field>
    {current&&<SpeedForm key={JSON.stringify([id,current.speedCalculation])} {...props} wind={wind} caseId={id}/>}
  </details>;
}
function SpeedForm({project,onChange,wind,caseId}:Props&{wind:WindDeclaration;caseId:string}){
  const existing=wind.cases.find(c=>c.id===caseId)!.speedCalculation;
  const [category,setCategory]=useState(existing?.category??""),[size,setSize]=useState(existing?.sizeClass??""),[s3,setS3]=useState(existing?String(existing.s3):"");
  const [source,setSource]=useState(existing?.reference.source??""),[revision,setRevision]=useState(existing?.reference.revision??""),[responsible,setResponsible]=useState(existing?.reference.responsible??""),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState("");
  const height=useMemo(()=>Math.max(...(resolvePhysicalStructure(project).model?.nodes.map(n=>n.z)??[]))/1000,[project]);
  const recorded=existing?calculateWindSpeed(existing):null;
  return <div><p>V0 declarado: {wind.building.basicVelocityMS} m/s; fonte: {wind.building.velocityReference.source}. Altura calculada do topo em relação à base z=0: {Number.isFinite(height)?height:"pendente"} m.</p>
    <Field label="Categoria de rugosidade para S2"><Select value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="">Declare</option>{["I","II","III","IV","V"].map(c=><option key={c}>{c}</option>)}</Select></Field>
    <Field label="Classe dimensional para S2"><Select value={size} onChange={e=>setSize(e.target.value as typeof size)}><option value="">Declare</option>{["A","B","C"].map(c=><option key={c}>{c}</option>)}</Select></Field>
    <Field label="Fator S3 declarado"><Input value={s3} onChange={e=>setS3(e.target.value)}/></Field>
    <Field label="Fonte do cálculo de velocidade"><Input value={source} maxLength={1000} onChange={e=>setSource(e.target.value)}/></Field><Field label="Revisão do cálculo de velocidade"><Input value={revision} maxLength={1000} onChange={e=>setRevision(e.target.value)}/></Field><Field label="Responsável pelo cálculo de velocidade"><Input value={responsible} maxLength={1000} onChange={e=>setResponsible(e.target.value)}/></Field>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Declaro terreno plano/fracamente acidentado, ausência de transição de rugosidade e base do modelo no nível geral do terreno; categoria, classe e S3 foram revisados conforme a fonte indicada.</label>
    <button type="button" className="button secondary" onClick={()=>{try{
      if(!confirmed||!s3.trim())throw Error("Confirme as condições físicas e informe S3 com sua fonte.");
      const value={schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:wind.building.basicVelocityMS,heightM:height,heightReference:"model-base-z0",topography:"flat-or-gently-undulating",roughnessTransition:"none",category,sizeClass:size,s3:Number(s3.replace(",",".")),reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"4.2; 5.2(a); 5.3.3; Tables 1-3",source,revision,responsible}};
      const changed=applyWindSpeed(project,caseId,value);onChange({workspace:changed.project.workspace});setMessage("Pressão do caso atualizada. Refaça a revisão de independência das ações e recalcule o modelo físico.");
    }catch(e){setMessage((e as Error).message);}}}>Calcular e aplicar q neste caso</button>
    {message&&<p role="status">{message}</p>}{recorded&&<p data-testid="wind-speed-result">Cálculo registrado: S1={recorded.s1}; S2={recorded.s2.toPrecision(8)}; Vk={recorded.vkMps.toPrecision(8)} m/s; q={recorded.dynamicPressurePa.toPrecision(8)} Pa. Altura efetiva={recorded.effectiveHeightM} m. Avaliação completa de vento: pendente.</p>}
  </div>;
}
