"use client";
import {useState} from "react";
import type {Project} from "@/domain/models";
import {packageTakeoff} from "@/lib/exports/package-source";
import {declaredCommercialGroups} from "@/lib/exports/package-commercial-groups";
import {downloadBlob} from "@/lib/exports/proposal";
import type {createCompletePackage} from "@/lib/exports/complete-package";
import {Field,Select} from "@/components/ui";
import {NumberField} from "@/components/number-field";

type Package=Awaited<ReturnType<typeof createCompletePackage>>;
export function CompletePackageControl({project,onChange,beforeExport}:{project:Project;onChange:(patch:Partial<Project>)=>void;beforeExport:()=>void}){
  const [format,setFormat]=useState<"A3"|"A1">("A3"),[stock,setStock]=useState<Record<string,number>>({}),[barPrices,setBarPrices]=useState<Record<string,number>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<{identity:string;value:Package}|null>(null);
  const identity=JSON.stringify({project,format,stock,barPrices}),current=result?.identity===identity?result.value:null;
  let groups:{key:string;label:string}[]=[],geometryError="";
  try{groups=project.workspace.physicalStructure?declaredCommercialGroups(project):packageTakeoff(project).groups;}catch(e){geometryError=e instanceof Error?e.message:String(e);}
  async function generate(){
    setBusy(true);setError("");setResult(null);
    try{
      beforeExport();
      const {createCompletePackage}=await import("@/lib/exports/complete-package");
      const value=await createCompletePackage(project,{format,stockByGroup:stock,
        barPriceCentsByGroup:Object.fromEntries(Object.entries(barPrices).map(([key,v])=>[key,Math.round(v*100)]))});
      setResult({identity,value});downloadBlob(new Blob([value.zip],{type:"application/zip"}),value.name);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível gerar o pacote.");}finally{setBusy(false);}
  }
  const changeCutting=(key:"kerfMm"|"endTrimMm"|"minimumRemnantMm",value:number|null)=>onChange({workspace:{...project.workspace,cutting:{...project.workspace.cutting,[key]:value}}});
  const changeSourceDimension=(pieceId:string,value:number|null)=>{
    const items=(project.workspace.dimensionalChecks??[]).filter(v=>v.pieceId!==pieceId);
    if(value!==null)items.push({pieceId,statedLengthMm:value,
      source:"Cota informada manualmente pelo usuário na exportação CAD",
      revision:project.workspace.physicalStructure?.revision??String(project.roof.revision),
      note:"Conferir diferença entre cota de origem e comprimento geométrico entre nós"});
    onChange({workspace:{...project.workspace,dimensionalChecks:items}});
  };
  const changeEnvelopeDimension=(axis:"x"|"y",value:number|null)=>{
    const items=(project.workspace.overallDimensionChecks??[]).filter(c=>c.axis!==axis);
    if(value!==null)items.push({axis,statedLengthMm:value,
      source:"Cota geral declarada pelo usuário para confronto com o contorno CAD",
      revision:project.workspace.physicalStructure?.revision??String(project.roof.revision)});
    onChange({workspace:{...project.workspace,overallDimensionChecks:items}});
  };
  return <section aria-label="Pacote completo de documentação" data-testid="complete-package-control">
    <h4>Pacote completo de documentação</h4>
    <p>AutoCAD, PDF das mesmas pranchas, materiais CSV, memorial e simulação de corte em um ZIP. Documentos preliminares para conferência.</p>
    <Field label="Formato das pranchas"><Select value={format} disabled={busy} onChange={e=>setFormat(e.target.value as "A3"|"A1")}><option>A3</option><option>A1</option></Select></Field>
    <details><summary>Dados para o plano de corte</summary>
      <p>Sem estes dados, o pacote informa a pendência e disponibiliza os demais documentos. A simulação usa os comprimentos geométricos, ou os finais já declarados no projeto, conforme a configuração de corte.</p>
      <div className="form-grid">
        <NumberField label="Serra (mm)" value={project.workspace.cutting.kerfMm} min={0} max={1000} onChange={v=>changeCutting("kerfMm",v)}/>
        <NumberField label="Perda por extremidade (mm)" value={project.workspace.cutting.endTrimMm} min={0} max={100000} onChange={v=>changeCutting("endTrimMm",v)}/>
        <NumberField label="Sobra reaproveitável mínima (mm)" value={project.workspace.cutting.minimumRemnantMm} min={0} max={1000000} onChange={v=>changeCutting("minimumRemnantMm",v)}/>
      </div>
      {project.workspace.physicalStructure&&groups.map(g=><div key={g.key}>
          <NumberField label={`Barra comercial (mm): ${g.label}`} value={stock[g.key]??null} min={1} max={1000000} onChange={v=>setStock(old=>{const next={...old};if(v===null)delete next[g.key];else next[g.key]=v;return next;})}/>
          <NumberField label={`Preço de compra por barra (R$, opcional): ${g.label}`} value={barPrices[g.key]??null} min={0} max={1000000} onChange={v=>setBarPrices(old=>{const next={...old};if(v===null)delete next[g.key];else next[g.key]=v;return next;})}/>
        </div>)}
      {!project.workspace.physicalStructure&&<p>Comprimentos comerciais: usados conforme os perfis cadastrados na etapa Estrutura.</p>}
    </details>
    {project.workspace.physicalStructure&&<details>
      <summary>Cotas da planta para conferência (opcional)</summary>
      <p>Informe a medida declarada para comparar com o comprimento geométrico entre nós. Divergências superiores a 2 mm aparecem como PENDENTE nas pranchas e documentos. Isso não libera fabricação.</p>
      <div className="form-grid">
        {project.workspace.physicalStructure.pieces.map(p=><NumberField key={p.id}
          label={`Cota informada (mm): ${p.id}`}
          value={project.workspace.dimensionalChecks?.find(v=>v.pieceId===p.id)?.statedLengthMm??null}
          min={0.001} max={1000000} onChange={v=>changeSourceDimension(p.id,v)}/>)}
      </div>
    </details>}
    {project.workspace.physicalStructure&&<details>
      <summary>Cotas gerais para confronto (opcional)</summary>
      {(["x","y"] as const).map(axis=><NumberField key={axis}
        label={`Cota geral ${axis.toUpperCase()} declarada (mm)`}
        value={project.workspace.overallDimensionChecks?.find(v=>v.axis===axis)?.statedLengthMm??null}
        min={1} max={1000000} onChange={v=>changeEnvelopeDimension(axis,v)}/>)}
    </details>}
    <button type="button" className="button" disabled={busy||!!geometryError} onClick={()=>void generate()}>{busy?"Gerando pacote…":"Exportar pacote completo"}</button>
    {busy&&<p role="status">Gerando pranchas e documentos desta revisão…</p>}
    {(error||geometryError)&&<p role="alert">{error||geometryError}</p>}
    {current&&<div role="status"><p>{current.manifest.pages.length} pranchas geradas. {current.manifest.cuttingAvailable?"Plano de corte incluído.":"Plano de corte pendente; consulte o memorial."}</p>
      <ul>{current.manifest.pending.map(p=><li key={p}>{p}</li>)}</ul>
      <div className="actions">{current.files.map(file=><button type="button" className="button secondary" key={file.name} onClick={()=>downloadBlob(new Blob([new Uint8Array(file.bytes)],{type:file.mime}),file.name.replaceAll("/","-"))}>{file.name}</button>)}</div>
    </div>}
  </section>;
}
