"use client";
import { useMemo, useState } from "react";
import type { Project } from "@/domain/models";
import { applyEngineeringPackage } from "@/domain/engineering-declarations";
import { distributeWindActions } from "@/domain/wind-load-path";
import { generatedRoofRegions } from "@/domain/roof-load-path";
import { structureSignature } from "@/domain/calculations/project-basis";
import { downloadText } from "@/lib/format";
import { WindSpeedControl } from "./wind-speed-control";

export function WindEngineeringPanel({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}) {
  const [json,setJson] = useState(""), [message,setMessage] = useState("");
  const draft = project.workspace.spatialPreparation, wind = draft?.loading?.wind;
  const {trace,diagnostic} = useMemo(() => {
    try { return {trace:wind?distributeWindActions(project,wind):null,diagnostic:""}; }
    catch(e) { return {trace:null,diagnostic:(e as Error).message}; }
  },[project,wind]);
  function template() {
    try {
      const ref = {standard:"",edition:"",clause:"",source:"",revision:"",responsible:""};
      const ids = [...(draft?.cases.filter(c=>!wind?.cases.some(w=>w.id===c.id)).map(c=>c.id)??[]),"VENTO"];
      setJson(JSON.stringify({schema_version:"jpn.engineering-package/1",wind:{
        schema_version:"jpn.wind-roof/1",normativeValidation:"pending-engineer-review",geometrySignature:structureSignature(project),
        scope:"global-roof-only",transmission:"",building:{location:"",basicVelocityMS:null,velocityReference:ref,terrain:"",roughness:"",topography:"",factorsDescription:"",enclosure:"",openingsDescription:"",internalPressureDescription:"",staticApplicability:"",loadPath:"",reference:ref},
        cases:[{id:"VENTO",incidenceDeg:null,dynamicPressurePa:null,reference:ref,zones:generatedRoofRegions(project).regions.map(r=>({id:`${r.id}-Z1`,regionId:r.id,boundsM:r.boundsM,kind:"",externalCoefficient:null,internalCoefficient:null,reference:ref}))}],
      },combinations:{schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",actions:ids.map(caseId=>({caseId,category:caseId==="VENTO"?"wind":null,exclusiveGroup:caseId==="VENTO"?"WIND":null,reference:ref})),combinations:[{id:"DECLARADA",purpose:"",hypothesis:"",reference:ref,terms:ids.map(caseId=>({caseId,gamma:null,psi:null,reference:ref}))}]}},null,2));
      setMessage("Modelo com campos pendentes: nenhum coeficiente físico ou normativo foi preenchido. Divida as zonas conforme sua referência antes de registrar.");
    } catch(e) { setMessage((e as Error).message); }
  }
  return <details className="technical-details" data-testid="wind-engineering"><summary>Vento zonal e combinações declaradas — experimental</summary>
    <WindSpeedControl project={project} onChange={onChange}/>
    <p>Cobertura retangular de uma ou duas águas, volume fechado único, ação estática normal à superfície. Fachadas, telhas e fixadores locais não são verificados. Não há seleção automática de coeficientes ABNT nem aprovação normativa.</p>
    <p>Importação técnica versionada: q em Pa fornecido pelo engenheiro; pressão líquida q × (cpe − cpi), positiva para dentro e negativa para fora. Área da superfície inclinada em m². Coordenadas globais XYZ em metros. Zonas retangulares devem cobrir cada água sem lacunas ou sobreposição. Fronteiras longitudinais devem coincidir com extremos das peças de terça.</p>
    <p>O caminho suportado exige telhamento biapoiado entre terças: transmission = simply-supported-sheeting-to-parallel-purlins; enclosure = enclosed. Outras hipóteses são recusadas. Fatores gamma e psi devem ser declarados para todos os casos, inclusive zeros, com categoria, grupo de exclusão, finalidade ULS/SLS, fonte, edição, cláusula e responsável.</p>
    <div className="actions"><button type="button" className="button secondary" onClick={template}>Preparar JSON com campos pendentes</button>{wind&&draft?.engineeringCombinations&&<button type="button" className="button secondary" onClick={()=>setJson(JSON.stringify({schema_version:"jpn.engineering-package/1",wind,combinations:draft.engineeringCombinations},null,2))}>Editar declarações de vento atuais</button>}</div>
    <label>Declarações de vento e combinações (JSON)<textarea aria-label="Declarações de vento e combinações (JSON)" value={json} maxLength={180000} rows={12} style={{width:"100%",maxWidth:"100%",boxSizing:"border-box"}} onChange={e=>setJson(e.target.value)}/></label>
    <button type="button" className="button secondary" onClick={()=>{
      try { const next=applyEngineeringPackage(project,JSON.parse(json));onChange({workspace:next.workspace});setMessage("Declarações registradas. Tabela de combinações substituída pelos fatores explícitos do JSON. Resultados e revisão de duplicidade invalidados; reveja a independência das ações."); }
      catch(e){setMessage((e as Error).message);}
    }}>Registrar vento e substituir combinações declaradas</button>
    {message&&<p role="status">{message}</p>}{diagnostic&&<p role="alert">{diagnostic}</p>}
    {trace&&<div data-testid="wind-load-trace"><p>{trace.cases.length} casos de vento · {trace.regions.regions.length} águas · revisão normativa pendente.</p>
      {trace.cases.map(c=><details key={c.caseId}><summary>{c.caseId} · {c.zones.length} zonas · força XYZ {c.forceN.map(v=>v.toPrecision(7)).join("; ")} N</summary>
        <p>Momento global XYZ: {c.momentNm.map(v=>v.toPrecision(7)).join("; ")} N·m. Forças e momentos conferidos por zona.</p>
        <ul>{c.zones.map(z=><li key={z.declaration.id}>{z.declaration.id} · {z.declaration.regionId} · {z.netPressurePa} Pa · {z.areaM2.toPrecision(7)} m² · {z.contributions.length} transferências às terças.</li>)}</ul>
      </details>)}
      <button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify(trace,null,2),"jpn-vento-caminho-cargas.json")}>Exportar rastreabilidade do vento</button>
    </div>}
  </details>;
}
