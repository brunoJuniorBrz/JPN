"use client";
import { useState } from "react";
import { coldFormedQuantityKeys,coldFormedPropertySchema } from "@/domain/cold-formed-properties";
import type { Project } from "@/domain/models";
import { Field,Input } from "@/components/ui";

export function ColdFormedPropertiesForm({project,pieceId,onChange}:{project:Project;pieceId:string;onChange:(p:Partial<Project>)=>void}){
  const d=project.workspace.spatialPreparation!,existing=d.resistance?.find(p=>p.pieceId===pieceId),p=existing?.coldFormed;
  const [values,setValues]=useState(()=>Object.fromEntries(coldFormedQuantityKeys.map(k=>[k,{value:p?.[k]?String(p[k]!.value):"",resolution:p?.[k]?String(p[k]!.resolution):""}])));
  const [source,setSource]=useState(p?.source??""),[revision,setRevision]=useState(p?.revision??""),[responsible,setResponsible]=useState(p?.responsible??""),[origin,setOrigin]=useState(p?.sectionOriginDescription??"");
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState("");
  if(existing?.family!=="cold-formed"||existing.geometry?.shape!=="u-stiffened")return null;
  return <details data-testid="cold-formed-properties"><summary>Propriedades físicas Ue — M26</summary><p>Declare valores e resolução absoluta na unidade de cada campo (Mm=mm, Cm2=cm², Cm3=cm³, Cm4=cm⁴, Cm6=cm⁶, Deg=graus, M=m). Sem conversão de dimensões visuais ou valores presumidos. Centroide e centro de cisalhamento usam a origem abaixo.</p>
    <Field label="Fonte das propriedades Ue"><Input value={source} onChange={e=>setSource(e.target.value)} maxLength={1000}/></Field><Field label="Revisão das propriedades Ue"><Input value={revision} onChange={e=>setRevision(e.target.value)} maxLength={1000}/></Field><Field label="Responsável pelas propriedades Ue"><Input value={responsible} onChange={e=>setResponsible(e.target.value)} maxLength={1000}/></Field><Field label="Origem e referência da seção Ue"><Input value={origin} onChange={e=>setOrigin(e.target.value)} maxLength={1000}/></Field>
    {coldFormedQuantityKeys.map(k=><div className="form-grid" key={k}><Field label={`Ue ${k}`}><Input value={values[k].value} onChange={e=>setValues({...values,[k]:{...values[k],value:e.target.value}})}/></Field><Field label={`Resolução Ue ${k}`}><Input value={values[k].resolution} onChange={e=>setValues({...values,[k]:{...values[k],resolution:e.target.value}})}/></Field></div>)}
    <p>Seção efetiva dependente do estado de tensões, pontos de contenção e vínculos de empenamento continuam conforme cadastro técnico; ausentes ficam pendentes. Preencher propriedades não calcula resistência.</p>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo dimensões externas do aço e eixos centroidais principais compatíveis com y/z locais do solver.</label>
    <button type="button" className="button secondary" onClick={()=>{try{
      if(!confirmed)throw Error("Confirme a referência física e os eixos antes de registrar.");
      const number=(s:string)=>Number(s.replace(",","."));
      const coldFormed=coldFormedPropertySchema.parse({...p,schema_version:"jpn.cold-formed-properties/1",source,revision,responsible,sectionOriginDescription:origin,dimensionsBasis:"external-steel-dimensions",axes:"solver-local-yz-centroidal-principal",...Object.fromEntries(coldFormedQuantityKeys.map(k=>[k,values[k].value.trim()?{value:number(values[k].value),resolution:number(values[k].resolution)}:null])),effectiveSection:p?.effectiveSection??null,restraints:p?.restraints??[],warpingStart:p?.warpingStart??"pending",warpingEnd:p?.warpingEnd??"pending"});
      onChange({workspace:{...project.workspace,spatialPreparation:{...d,resistance:d.resistance!.map(v=>v.pieceId===pieceId?{...v,coldFormed}:v)}}});
    }catch(e){setError((e as Error).message);}}}>Registrar propriedades Ue e invalidar análise</button>{error&&<p role="alert">{error}</p>}
  </details>;
}
