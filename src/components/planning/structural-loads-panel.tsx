"use client";
import { WindEngineeringPanel } from "./wind-engineering-panel";
import { EngineeringCombinationsControl } from "./engineering-combinations-control";
import { RoofLoadPathPanel } from "./roof-load-path-panel";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { mixedPieceKind } from "@/domain/mixed-adapter";
import { newSpatialPreparation, pieceRoles } from "@/domain/spatial-preparation";
import { densitySchema, emptyLoading, loadingDraftSchema, needsSelfWeightOverlapReview, selfWeightOverlapReviewBasis, type LoadingDraft } from "@/domain/structural-loading";
import { resistanceDiagnostics, resistancePreparationSchema } from "@/domain/resistance-preparation";
import { elasticMemberReference } from "@/domain/resistance-elastic-reference";
import { structureSignature } from "@/domain/calculations/project-basis";
import { Field, Input, Select } from "@/components/ui";

export function StructuralLoadsPanel({project,onChange,onSelectPiece}:{project:Project;onChange:(patch:Partial<Project>)=>void;onSelectPiece?:(id:string)=>void}){
  const d=project.workspace.spatialPreparation??newSpatialPreparation(project), loading=d.loading??emptyLoading(), pieces=resolvePhysicalStructure(project).model?.pieces??[];
  const [density,setDensity]=useState(""),[densitySource,setDensitySource]=useState(""),[densityRevision,setDensityRevision]=useState(""),[role,setRole]=useState<typeof pieceRoles[number]>("column");
  const [gravity,setGravity]=useState(["","",""]),[caseId,setCaseId]=useState(""),[caseSource,setCaseSource]=useState("");
  const [piece,setPiece]=useState(""),[qCase,setQCase]=useState(""),[q,setQ]=useState(["","",""]),[coordinates,setCoordinates]=useState(""),[qSource,setQSource]=useState(""),[qRevision,setQRevision]=useState("");
  const [pressure,setPressure]=useState(""),[projection,setProjection]=useState(""),[direction,setDirection]=useState(["","",""]),[path,setPath]=useState(""),[areaSource,setAreaSource]=useState(""),[areaRevision,setAreaRevision]=useState("");
  const [areaCase,setAreaCase]=useState(""),[areaCaseName,setAreaCaseName]=useState("");
  const [family,setFamily]=useState(""),[fy,setFy]=useState(""),[fu,setFu]=useState(""),[ly,setLy]=useState(""),[lz,setLz]=useState(""),[lb,setLb]=useState("");
  const [resSource,setResSource]=useState(""),[resRevision,setResRevision]=useState(""),[restraint,setRestraint]=useState(""),[wy,setWy]=useState(""),[wz,setWz]=useState(""),[clause,setClause]=useState("");
  const [overlapSource,setOverlapSource]=useState(""),[overlapRevision,setOverlapRevision]=useState("");
  const [message,setMessage]=useState("");
  function attempt(run:()=>void){try{run();setMessage("Declaração registrada. Revise combinações antes de executar; resultados anteriores foram invalidados.");}catch(e){setMessage((e as Error).message);}}
  const number=(s:string)=>{if(!s.trim())throw new Error("Informe todos os valores, inclusive zeros explícitos.");const v=Number(s.replace(",","."));if(!Number.isFinite(v))throw new Error("Número inválido.");return v;};
  function change(next:LoadingDraft){onChange({workspace:{...project.workspace,spatialPreparation:{...d,loading:loadingDraftSchema.parse(next)}}});}
  const selected=pieces.find(p=>p.id===piece)??pieces[0], activeCase=d.cases.some(c=>c.id===qCase)?qCase:d.cases[0]?.id??"";
  const resistanceGeometryStale = d.geometrySignature !== structureSignature(project);
  const elasticReference=selected && !resistanceGeometryStale ? elasticMemberReference(selected,d.groups[selected.role],d.resistance?.find(v=>v.pieceId===selected.id)) : null;
  const overlapNeeded=needsSelfWeightOverlapReview(d,loading);
  const overlapValid=!overlapNeeded||(loading.overlapReview?.confirmed===true&&loading.overlapReview.basis===selfWeightOverlapReviewBasis(d,loading));
  const input=(label:string,value:string,change:(s:string)=>void)=><Field key={label} label={label}><Input value={value} onChange={e=>change(e.target.value)} maxLength={1000}/></Field>;
  return <details className="technical-details" data-testid="structural-loads"><summary>Carregamentos físicos automáticos e base resistente</summary>
    <p>Sem densidade ou gravidade presumidas. Pórticos recebem peso distribuído consistente; barras axiais recebem metade do peso em cada nó, sem flexão. Ativar peso cria caso e combinação isolados: fator 1 no caso novo e 0 nos demais, sem coeficientes normativos.</p>
    <h4>Densidade física declarada</h4><Field label="Grupo da densidade"><Select value={role} onChange={e=>setRole(e.target.value as typeof role)}>{pieceRoles.map(r=><option key={r}>{r}</option>)}</Select></Field>
    <p>Densidade registrada neste grupo: {d.groups[role].density?`${d.groups[role].density.kgM3} kg/m³ · ${d.groups[role].density.source} · ${d.groups[role].density.revision}`:"Pendente"}</p>
    <div className="form-grid">{input("Densidade (kg/m³)",density,setDensity)}{input("Fonte da densidade",densitySource,setDensitySource)}{input("Revisão da densidade",densityRevision,setDensityRevision)}</div>
    {[false,true].map(all=><button key={String(all)} className="button secondary" onClick={()=>attempt(()=>{const value=densitySchema.parse({kgM3:number(density),source:densitySource,revision:densityRevision});onChange({workspace:{...project.workspace,spatialPreparation:{...d,groups:{...d.groups,...Object.fromEntries((all?pieceRoles:[role]).map(r=>[r,{...d.groups[r],density:value}]))}}}});})}>{all?"Aplicar densidade declarada a todos os grupos":"Registrar densidade deste grupo"}</button>)}
    <h4>Peso próprio — ativação explícita</h4><div className="form-grid">{input("ID do novo caso permanente",caseId,setCaseId)}{input("Fonte do caso permanente",caseSource,setCaseSource)}{gravity.map((s,i)=>input(`Gravidade ${"XYZ"[i]} (m/s²)`,s,v=>setGravity(gravity.map((x,j)=>i===j?v:x))))}</div>
    <button className="button secondary" onClick={()=>attempt(()=>{
      if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(caseId)||!caseSource.trim()||d.cases.some(c=>c.id===caseId)||d.combinations.some(c=>c.id===caseId+"-ISO")||d.cases.length>=10||d.combinations.length>=10||loading.selfWeight)throw new Error("Informe ID novo (até 24 caracteres), fonte e capacidade para um caso/combinação. Peso já ativo deve ser desativado antes.");
      const g=gravity.map(number) as [number,number,number];if(Math.hypot(...g)===0||g.some(x=>Math.abs(x)>100))throw new Error("Declare gravidade não nula, componentes até 100 m/s².");
      onChange({workspace:{...project.workspace,spatialPreparation:{...d,loading:{...loading,selfWeight:{caseId,gravity:g,axialLumping:"half-to-end-nodes"}},cases:[...d.cases,{id:caseId,source:caseSource}],combinations:[...d.combinations.map(c=>({...c,factors:{...c.factors,[caseId]:0}})),{id:caseId+"-ISO",factors:Object.fromEntries([...d.cases.map(c=>[c.id,0]),[caseId,1]])}]}}});
    })}>Ativar peso e criar caso/combinação isolados</button>
    {loading.selfWeight&&<p>Peso ativo: {loading.selfWeight.caseId}, g={loading.selfWeight.gravity.join("; ")} m/s². <button className="button secondary" onClick={()=>attempt(()=>change({...loading,selfWeight:null}))}>Desativar peso próprio</button> O caso permanece no cadastro para revisão; remova/revise suas combinações explicitamente.</p>}
    {overlapNeeded&&<div className="notice" data-testid="self-weight-overlap-review">
      <strong>Atenção: possível dupla contagem de ações automáticas</strong>
      <p>A combinação reúne peso próprio, ações por área ou vento com outras ações. Confira se as fontes são independentes. A revisão se vincula às cargas, geometria, grupos e combinações atuais; não confirma segurança ou dimensionamento.</p>
      <div className="form-grid">{input("Fonte da conferência de duplicidade",overlapSource,setOverlapSource)}{input("Revisão da conferência de duplicidade",overlapRevision,setOverlapRevision)}</div>
      <button type="button" className="button secondary" onClick={()=>attempt(()=>{
        if(!overlapSource.trim()||!overlapRevision.trim())throw new Error("Declare fonte e revisão da conferência.");
        change({...loading,overlapReview:{confirmed:true,source:overlapSource,revision:overlapRevision,basis:selfWeightOverlapReviewBasis(d,loading)}});
      })}>Confirmo que as ações manuais combinadas e as ações por área não repetem as ações automáticas</button>
      <p>{overlapValid?"Revisão de possíveis duplicidades registrada para este conjunto exato de cargas.":"PENDENTE: confira as ações e registre a revisão antes de calcular."}</p>
    </div>}
    <h4>Carga uniforme por peça física</h4><p>N/m no contrato; formulário em kN/m. Toda a peça e seus segmentos recebem a mesma intensidade. Não aplicar carga transversal a axial.</p>
    <Field label="Peça da carga uniforme"><Select value={selected?.id??""} onChange={e=>setPiece(e.target.value)}>{pieces.map(p=><option key={p.id}>{p.id}</option>)}</Select></Field>
    <Field label="Caso da carga uniforme"><Select value={activeCase} onChange={e=>setQCase(e.target.value)}>{d.cases.map(c=><option key={c.id}>{c.id}</option>)}</Select></Field>
    <Field label="Sistema da carga uniforme"><Select value={coordinates} onChange={e=>setCoordinates(e.target.value)}><option value="">Declare</option><option value="global">Global XYZ</option><option value="local">Local xyz da peça</option></Select></Field>
    <div className="form-grid">{q.map((s,i)=>input(`Carga uniforme ${"XYZ"[i]} (kN/m)`,s,v=>setQ(q.map((x,j)=>i===j?v:x))))}{input("Fonte da carga uniforme",qSource,setQSource)}{input("Revisão da carga uniforme",qRevision,setQRevision)}</div>
    <button className="button secondary" onClick={()=>attempt(()=>{if(!selected||mixedPieceKind(selected,d)!=="frame")throw new Error("Selecione um pórtico explicitamente declarado; axial não recebe carga distribuída.");if(activeCase===loading.selfWeight?.caseId)throw new Error("Caso de peso próprio é exclusivo.");change({...loading,uniform:[...loading.uniform,{id:`U${crypto.randomUUID().slice(0,8)}`,pieceId:selected.id,caseId:activeCase,coordinates:coordinates as "local"|"global",knM:q.map(number) as [number,number,number],source:qSource,revision:qRevision}]});})}>Registrar carga uniforme</button>
    <ul>{loading.uniform.map(l=><li key={l.id}>{l.pieceId} · {l.caseId} · {l.coordinates} · {l.knM.join("; ")} kN/m · {l.source} ({l.revision}) <button className="button secondary" onClick={()=>change({...loading,uniform:loading.uniform.filter(x=>x.id!==l.id)})}>Remover carga {l.id}</button></li>)}</ul>
    <h4>Ações permanentes por área</h4><p>Declare uma ação uniforme para toda a cobertura suportada, em caso exclusivo. Projeção horizontal e superfície inclinada têm medidas diferentes. Vetor unitário global; sem vento ou coeficientes normativos automáticos.</p>
    <Field label="Caso da ação por área"><Select value={areaCase||activeCase} onChange={e=>setAreaCase(e.target.value)}>{d.cases.map(c=><option key={c.id}>{c.id}</option>)}</Select></Field>
    {input("Novo caso exclusivo de área",areaCaseName,setAreaCaseName)}
    <button type="button" className="button secondary" onClick={()=>attempt(()=>{
      if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(areaCaseName)||!areaSource.trim()||d.cases.some(c=>c.id===areaCaseName)||d.combinations.some(c=>c.id===areaCaseName+"-ISO")||d.cases.length>=10||d.combinations.length>=10)throw new Error("Declare ID novo, fonte da ação por área e capacidade de casos/combinações.");
      const cases=[...d.cases,{id:areaCaseName,source:areaSource}];
      onChange({workspace:{...project.workspace,spatialPreparation:{...d,cases,combinations:[...d.combinations.map(c=>({...c,factors:{...c.factors,[areaCaseName]:0}})),{id:areaCaseName+"-ISO",factors:Object.fromEntries(cases.map(c=>[c.id,c.id===areaCaseName?1:0]))}]}}});setAreaCase(areaCaseName);
    })}>Criar caso de área e combinação isolada (fator 1)</button>
    {input("Ação permanente de cobertura (kN/m²)",pressure,setPressure)}<Field label="Projeção da área"><Select value={projection} onChange={e=>setProjection(e.target.value)}><option value="">Declare</option><option value="horizontal">Horizontal</option><option value="roof-surface">Superfície inclinada</option></Select></Field>
    {direction.map((s,i)=>input(`Direção da ação por área ${"XYZ"[i]}`,s,v=>setDirection(direction.map((x,j)=>i===j?v:x))))}{input("Caminho de transmissão da cobertura",path,setPath)}{input("Fonte da ação por área",areaSource,setAreaSource)}{input("Revisão da ação por área",areaRevision,setAreaRevision)}
    <button className="button secondary" onClick={()=>attempt(()=>{const dir=direction.map(number) as [number,number,number];if(Math.abs(Math.hypot(...dir)-1)>1e-10)throw new Error("Declare vetor unitário da direção.");change({...loading,roofArea:[...loading.roofArea,{caseId:areaCase||activeCase,knM2:number(pressure),projection:projection as "horizontal"|"roof-surface",direction:dir,source:areaSource,revision:areaRevision,loadPath:path}]});})}>Registrar ação por área pendente</button>
    {loading.roofArea.map((l,i)=><p key={i}>PENDENTE: {l.knM2} kN/m² · {l.projection} · {l.caseId} · {l.loadPath} <button className="button secondary" onClick={()=>change({...loading,roofArea:loading.roofArea.filter((_,j)=>j!==i)})}>Remover ação por área {i+1}</button></p>)}
    <RoofLoadPathPanel project={project} onChange={onChange} onSelectPiece={onSelectPiece}/>
    <WindEngineeringPanel project={project} onChange={onChange}/>
    <EngineeringCombinationsControl project={project} onChange={onChange}/>
    <h4>Base resistente da peça selecionada — sem verificação normativa</h4>
    <Field label="Família real do perfil"><Select value={family} onChange={e=>setFamily(e.target.value)}><option value="">Pendente</option><option value="rolled">Laminado</option><option value="welded">Soldado</option><option value="tubular">Tubular</option><option value="cold-formed">Formado a frio</option></Select></Field>
    <div className="form-grid">{input("fy declarado (MPa)",fy,setFy)}{input("fu declarado (MPa)",fu,setFu)}{input("Comprimento de flambagem Y (m)",ly,setLy)}{input("Comprimento de flambagem Z (m)",lz,setLz)}{input("Distância de contenção lateral (m)",lb,setLb)}</div>
    <div className="form-grid">{input("Fonte dos dados resistentes",resSource,setResSource)}{input("Revisão dos dados resistentes",resRevision,setResRevision)}{input("Descrição das contenções",restraint,setRestraint)}{input("Módulo elástico Wy (cm³)",wy,setWy)}{input("Módulo elástico Wz (cm³)",wz,setWz)}{input("Norma, edição e cláusulas para revisão futura",clause,setClause)}</div>
    <p>A, Iy, Iz e J permanecem nas seções físicas. Dados adicionais de instabilidade e geometria efetiva ainda exigem revisão. Nenhum resultado de aprovação será produzido, mesmo com estes campos preenchidos.</p>
    <button className="button secondary" onClick={()=>attempt(()=>{if(!selected)throw new Error("Peça ausente.");const v=resistancePreparationSchema.parse({...d.resistance?.find(value=>value.pieceId===selected.id),pieceId:selected.id,family:family||null,fyMpa:fy?number(fy):null,fuMpa:fu?number(fu):null,bucklingYM:ly?number(ly):null,bucklingZM:lz?number(lz):null,lateralRestraintM:lb?number(lb):null,source:resSource,revision:resRevision,sectionProperties:{wyCm3:wy?number(wy):null,wzCm3:wz?number(wz):null},restraintDescription:restraint,normativeReference:clause});onChange({workspace:{...project.workspace,spatialPreparation:{...d,resistance:[...(d.resistance??[]).filter(x=>x.pieceId!==v.pieceId),v]}}});})}>Registrar base resistente pendente</button>
    {(d.resistance??[]).map(v=><p key={v.pieceId}>{v.pieceId}: {resistanceDiagnostics(v).issues.join(" ")}</p>)}
    {resistanceGeometryStale && <p role="alert">Referências teóricas bloqueadas: geometria/revisão física desatualizadas. Atualize a preparação antes de consultar esta peça.</p>}
    {elasticReference && <section className="notice" data-testid="resistance-elastic-reference" aria-label="Referências analíticas não normativas">
      <h4>Referências elásticas — {selected?.id ?? "peça não selecionada"} (não dimensionamento)</h4>
      <p>Valores teóricos derivados SOMENTE das propriedades físicas declaradas para esta peça. Nenhuma verificação de norma, estabilidade real, ligação ou segurança foi concluída.</p>
      {elasticReference.reference
        ? <div className="form-grid">
            <p>Peça: {elasticReference.reference.physicalLengthM.toFixed(3)} m; comprimentos efetivos DECLARADOS Y/Z: {elasticReference.reference.effectiveLengthYM.toFixed(3)} / {elasticReference.reference.effectiveLengthZM.toFixed(3)} m.</p>
            <p>Esbeltez geométrica teórica Y/Z (Lef/r): {elasticReference.reference.slendernessY.toFixed(2)} / {elasticReference.reference.slendernessZ.toFixed(2)}.</p>
            <p>Referência idealizada de escoamento bruto A·fy: {elasticReference.reference.grossYieldReferenceKn.toFixed(2)} kN (não resistência de cálculo).</p>
            <p>Euler idealizado por flexão Y/Z: {elasticReference.reference.eulerYKn.toFixed(2)} / {elasticReference.reference.eulerZKn.toFixed(2)} kN (não resistência de cálculo).</p>
          </div>
        : <p>Referências indisponíveis: informe e revise material, seção, orientação e comprimentos efetivos da peça.</p>}
      <ul>{elasticReference.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
      <strong>NÃO VERIFICADO — não usar estes números para dimensionar ou fabricar.</strong>
    </section>}

    {message&&<p role="status">{message}</p>}
  </details>;
}
