"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import type { SpatialPreparation } from "@/domain/spatial-preparation";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { physicalCatalogSchema } from "@/domain/member-physical";
import { useData } from "@/components/data-provider";
import { Field,Input,Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { densitySchema } from "@/domain/structural-loading";

type Catalog=NonNullable<SpatialPreparation["physicalCatalog"]>;
const nextId=(prefix:string,rows:readonly {id:string}[])=>{let i=1;while(rows.some(r=>r.id===`${prefix}${i}`))i++;return `${prefix}${i}`;};
export function MemberPhysicalCatalogPanel({project,draft,onChange}:{project:Project;draft:SpatialPreparation;onChange:(draft:SpatialPreparation)=>void}){
  const {data}=useData(),model=resolvePhysicalStructure(project).model;
  const [pieceId,setPieceId]=useState(""),[materialId,setMaterialId]=useState(""),[sectionId,setSectionId]=useState(""),[registered,setRegistered]=useState("");
  const cat=draft.physicalCatalog,piece=model?.pieces.find(p=>p.id===pieceId)??model?.pieces[0];
  const material=cat?.materials.find(m=>m.id===materialId)??cat?.materials[0],section=cat?.sections.find(s=>s.id===sectionId)??cat?.sections[0];
  const save=(next:Catalog)=>onChange({...draft,physicalCatalog:physicalCatalogSchema.parse(next)});
  function addPair(){
    const next:Catalog=structuredClone(cat??{schema_version:"jpn.physical-catalog/1",materials:[],sections:[],assignments:[]});
    const m=nextId("M",next.materials),s=nextId("S",next.sections),known=data.materials.find(v=>v.id===registered)?.physicalDeclaration;
    next.materials.push({id:m,steelGrade:known?.steelGrade??"",materialSource:known?.materialSource??"",materialRevision:known?.materialRevision??"",eGpa:known?.eGpa??null,gGpa:known?.gGpa??null,nu:known?.nu??null,...(known?.density?{density:known.density}:{})});
    next.sections.push({id:s,areaCm2:known?.areaCm2??null,iyCm4:known?.iyCm4??null,izCm4:known?.izCm4??null,jCm4:known?.jCm4??null,sectionSource:known?.sectionSource??"",sectionRevision:known?.sectionRevision??""});
    save(next);setMaterialId(m);setSectionId(s);
  }
  const updateMaterial=(patch:Partial<NonNullable<typeof material>>)=>{if(cat&&material)save({...cat,materials:cat.materials.map(m=>m.id===material.id?{...m,...patch}:m)});};
  const updateSection=(patch:Partial<NonNullable<typeof section>>)=>{if(cat&&section)save({...cat,sections:cat.sections.map(s=>s.id===section.id?{...s,...patch}:s)});};
  return <section className="technical-details" aria-label="Propriedades físicas por barra" data-testid="member-physical-catalog"><h4>Materiais e seções por barra</h4>
    <p>Atribuição individual prevalece sobre o grupo. Dados físicos são independentes dos perfis visuais; campos incompletos bloqueiam a análise. Não há propriedades resistentes aprovadas por importação.</p>
    <div className="form-grid"><Field label="Dados físicos já cadastrados"><Select value={registered} onChange={e=>setRegistered(e.target.value)}><option value="">Novo cadastro sem valores presumidos</option>{data.materials.filter(m=>!m.isExample&&m.physicalDeclaration).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field><button type="button" className="button secondary" disabled={(cat?.materials.length??0)>=50||(cat?.sections.length??0)>=50} onClick={addPair}>Adicionar material e seção físicos</button></div>
    {cat&&<>
      {material&&<details className="technical-details" open><summary>Editar material físico</summary><Field label="Material físico cadastrado"><Select value={material.id} onChange={e=>setMaterialId(e.target.value)}>{cat.materials.map(m=><option key={m.id}>{m.id}</option>)}</Select></Field>
        <div className="form-grid"><Field label={`Material ${material.id} · identificação`}><Input maxLength={1000} value={material.steelGrade} onChange={e=>updateMaterial({steelGrade:e.target.value})}/></Field>
          {([["eGpa","E (GPa)"],["gGpa","G (GPa)"],["nu","Poisson ν"]] as const).map(([key,label])=><NumberField key={material.id+key} label={`Material ${material.id} · ${label}`} value={material[key]} min={key==="nu"?-.99:0} max={key==="nu"?.499:10000} onChange={v=>updateMaterial({[key]:key!=="nu"&&v===0?null:v})}/>)}
          <Field label={`Material ${material.id} · fonte`}><Input maxLength={1000} value={material.materialSource} onChange={e=>updateMaterial({materialSource:e.target.value})}/></Field><Field label={`Material ${material.id} · revisão`}><Input maxLength={1000} value={material.materialRevision} onChange={e=>updateMaterial({materialRevision:e.target.value})}/></Field></div>
        <CatalogDensity key={material.id+JSON.stringify(material.density)} value={material.density} onSave={density=>updateMaterial({density})}/>
      </details>}
      {section&&<details className="technical-details" open><summary>Editar seção física</summary><Field label="Seção física cadastrada"><Select value={section.id} onChange={e=>setSectionId(e.target.value)}>{cat.sections.map(s=><option key={s.id}>{s.id}</option>)}</Select></Field>
        <Field label={`Seção ${section.id} · designação do perfil`}><Input value={section.designation??""} onChange={e=>updateSection({designation:e.target.value})}/></Field>
        <NumberField label={`Seção ${section.id} · preço declarado (R$/m)`} value={section.pricePerMeterCents==null?null:section.pricePerMeterCents/100} min={0} max={100000000} onChange={v=>updateSection({pricePerMeterCents:v===null?null:Math.round(v*100)})}/>
        <Field label={`Seção ${section.id} · fonte comercial`}><Input value={section.priceSource??""} onChange={e=>updateSection({priceSource:e.target.value})}/></Field><Field label={`Seção ${section.id} · revisão comercial`}><Input value={section.priceRevision??""} onChange={e=>updateSection({priceRevision:e.target.value})}/></Field>
        <div className="form-grid">{([["areaCm2","Área A (cm²)"],["iyCm4","Inércia Iy (cm⁴)"],["izCm4","Inércia Iz (cm⁴)"],["jCm4","Torção J (cm⁴)"]] as const).map(([key,label])=><NumberField key={section.id+key} label={`Seção ${section.id} · ${label}`} value={section[key]} min={0} max={1e12} onChange={v=>updateSection({[key]:v===0?null:v})}/>)}
          <Field label={`Seção ${section.id} · fonte`}><Input maxLength={1000} value={section.sectionSource} onChange={e=>updateSection({sectionSource:e.target.value})}/></Field><Field label={`Seção ${section.id} · revisão`}><Input maxLength={1000} value={section.sectionRevision} onChange={e=>updateSection({sectionRevision:e.target.value})}/></Field></div>
      </details>}
      {piece&&<><Field label="Barra para atribuição física"><Select value={piece.id} onChange={e=>setPieceId(e.target.value)}>{model!.pieces.map(p=><option key={p.id}>{p.id}</option>)}</Select></Field><MemberBinding key={piece.id+JSON.stringify(cat.assignments.find(a=>a.pieceId===piece.id))} pieceId={piece.id} catalog={cat} onChange={save}/></>}
    </>}
  </section>;
}
function CatalogDensity({value,onSave}:{value:Catalog["materials"][number]["density"];onSave:(density:Catalog["materials"][number]["density"])=>void}){
  const [rho,setRho]=useState<number|null>(value?.kgM3??null),[source,setSource]=useState(value?.source??""),[revision,setRevision]=useState(value?.revision??""),[error,setError]=useState("");
  return <><div className="form-grid"><NumberField label="Densidade deste material (kg/m³)" value={rho} min={0} max={100000} onChange={setRho}/><Field label="Fonte da densidade do material"><Input value={source} onChange={e=>setSource(e.target.value)}/></Field><Field label="Revisão da densidade do material"><Input value={revision} onChange={e=>setRevision(e.target.value)}/></Field></div>
    <button type="button" className="button secondary" onClick={()=>{try{onSave(densitySchema.parse({kgM3:rho,source,revision}));setError("");}catch{setError("Declare densidade positiva, fonte e revisão; nenhuma densidade é presumida.");}}}>Registrar densidade deste material</button>{error&&<p role="alert">{error}</p>}</>;
}
function MemberBinding({pieceId,catalog,onChange}:{pieceId:string;catalog:Catalog;onChange:(cat:Catalog)=>void}){
  const current=catalog.assignments.find(a=>a.pieceId===pieceId),[material,setMaterial]=useState(current?.materialId??""),[section,setSection]=useState(current?.sectionId??""),[rotation,setRotation]=useState<number|null>(current?.rotationDeg??null),[error,setError]=useState("");
  return <><p>{current?`${pieceId}: material ${current.materialId} · seção ${current.sectionId}`:`${pieceId}: herda propriedades do grupo por papel.`}</p><div className="form-grid">
    <Field label="Material físico da barra"><Select value={material} onChange={e=>setMaterial(e.target.value)}><option value="">Selecionar</option>{catalog.materials.map(m=><option key={m.id}>{m.id}</option>)}</Select></Field>
    <Field label="Seção física da barra"><Select value={section} onChange={e=>setSection(e.target.value)}><option value="">Selecionar</option>{catalog.sections.map(s=><option key={s.id}>{s.id}</option>)}</Select></Field>
    <Field label="Giro físico da barra (graus)"><Input type="number" min={-360} max={360} value={rotation??""} onChange={e=>setRotation(e.target.value===""?null:Number(e.target.value))}/></Field>
  </div><div className="actions"><button type="button" className="button secondary" onClick={()=>{if(!material||!section){setError("Selecione material e seção; nenhuma referência será presumida.");return;}try{onChange(physicalCatalogSchema.parse({...catalog,assignments:[...catalog.assignments.filter(a=>a.pieceId!==pieceId),{pieceId,materialId:material,sectionId:section,rotationDeg:rotation}]}));}catch{setError("Atribuição inválida; confira referências e giro.");}}}>Aplicar propriedades à barra</button>
    <button type="button" className="button secondary" onClick={()=>onChange({...catalog,assignments:catalog.assignments.filter(a=>a.pieceId!==pieceId)})}>Usar herança do grupo</button></div>{error&&<p role="alert">{error}</p>}
  </>;
}
