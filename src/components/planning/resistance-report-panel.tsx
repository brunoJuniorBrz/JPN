"use client";
import { useState } from "react";
import type { ResistanceReport } from "@/domain/resistance-report";
import { demandComponents, type DemandComponent, type DemandRow } from "@/domain/member-demands";
import type { Project } from "@/domain/models";
import { resistancePreparationSchema, resistantSectionGeometrySchema } from "@/domain/resistance-preparation";
import { Field, Input, Select } from "@/components/ui";
import { ContinuousDemandsPanel } from "./continuous-demands-panel";
import { ColdFormedPropertiesForm } from "./cold-formed-properties-form";
import { SectionAnalysisControl } from "./section-analysis-control";
import { DeclaredServiceControl } from "./declared-service-control";

const labels:Record<DemandComponent,string>={nN:"N",vyN:"Vy",vzN:"Vz",tNm:"T",myNm:"My",mzNm:"Mz"};
const show=(n:number|null)=>n===null?"Não aplicável":n===0?"0":n.toExponential(5);
function ConcurrentRow({row}:{row:DemandRow}){
  return <><td>{row.segmentId}</td><td>{row.combinationId}</td><td>{show(row.segmentPositionM)} / {show(row.originalPositionM)} m</td><td>{demandComponents.map(k=>`${labels[k]}=${show(row.forces[k])}`).join("; ")}</td></>;
}

export function ResistanceReportPanel({report,selectedPiece,onSelectPiece,onExport,project,onChange}:{report:ResistanceReport;selectedPiece:string;onSelectPiece:(id:string)=>void;onExport:()=>void;project:Project;onChange:(patch:Partial<Project>)=>void}){
  const [component,setComponent]=useState<DemandComponent>("nN");
  const data=report.pieces.find(p=>p.pieceId===selectedPiece),demands=report.demands.pieces.find(p=>p.pieceId===selectedPiece);
  const rows=demands?new Map(demands.samples.map(s=>[s.id,s])):null;
  return <section className="notice" data-testid="resistance-report" aria-label="Solicitações e preparação resistente">
    <h4>Solicitações e preparação resistente — M23 parcial</h4>
    <p data-testid="engine-release-gate"><strong>MOTOR NÃO PRONTO — BLOQUEADO</strong>. Análise, critérios declarados, resistência normativa, revisão profissional e fabricação são estados separados.</p>
    <details><summary>Bloqueios da cadeia estrutural completa</summary><ul>{report.releaseGate.blocked.map(x=><li key={x.id}>{x.reason}</li>)}</ul></details>
    <p>Estrutura NÃO APROVADA PARA FABRICAÇÃO. Nenhum procedimento resistente normativo implementado. Verificações individuais pendentes; peça incompleta. Os números abaixo são solicitações e controles analíticos, sem índice de utilização ou aprovação.</p>
    <p>Máximos/mínimos apenas nas estações amostradas; os esforços de cada linha são simultâneos na mesma combinação e posição. N positivo = tração; negativo = compressão. Forças em N e momentos em N·m, nos eixos locais do solver.</p>
    <Field label="Componente dos extremos amostrados"><Select value={component} onChange={e=>setComponent(e.target.value as DemandComponent)}>{demandComponents.map(k=><option key={k} value={k}>{labels[k]}</option>)}</Select></Field>
    <details><summary>Tabela de extremos amostrados das peças</summary>
      <div style={{overflowX:"auto"}} role="region" aria-label="Tabela de solicitações por peça" tabIndex={0}><table><thead><tr><th>Peça / critério</th><th>Segmento</th><th>Combinação</th><th>x segmento / peça</th><th>N, Vy, Vz, T, My, Mz concomitantes</th></tr></thead><tbody>
        {report.demands.pieces.flatMap(p=>{
          const extrema=p.critical[component];if(!extrema)return [];
          return (["minimum","maximum"] as const).map(criterion=>{const row=p.samples.find(s=>s.id===extrema[criterion])!;return <tr key={`${p.pieceId}-${criterion}`}><td><button type="button" className="button secondary" onClick={()=>onSelectPiece(p.pieceId)}>Ver {p.pieceId}</button> {criterion==="minimum"?"mínimo":"máximo"}</td><ConcurrentRow row={row}/></tr>;});
        })}
      </tbody></table></div>
    </details>
    {data&&demands&&rows&&<div data-testid="resistance-selected" data-piece-id={selectedPiece}>
      <h4>{selectedPiece} · {data.profileDesignation??"Perfil físico ainda sem designação"}</h4>
      <ContinuousDemandsPanel report={report.continuousDemands} pieceId={selectedPiece}/>
      <DeclaredServiceControl key={`service-${selectedPiece}`} project={project} pieceId={selectedPiece} report={report} onChange={onChange}/>
      <SectionAnalysisControl key={`section-${selectedPiece}`} project={project} pieceId={selectedPiece}/>
      <p data-testid="normative-readiness">Prontidão normativa: {data.normativeReadiness.status}; combinações: {data.normativeReadiness.combinationStatus}. Nenhuma resistência ou utilização disponível.</p>
      {data.normativeReadiness.physical&&<ul>{data.normativeReadiness.physical.issues.map((v,i)=><li key={i}>{v.code}: {v.message}</li>)}</ul>}
      <p>{demands.kind==="axial"?"Elemento axial: flexão, cortantes e torção não aplicáveis ao modelo.":`Pórtico; seção girada ${demands.axes!.rotationDeg}° conforme a entrada; eixos locais PyNite.`} {demands.segments.length} segmento(s); comprimento original {show(demands.lengthM)} m.</p>
      <div style={{overflowX:"auto"}} role="region" aria-label="Extremos concomitantes da peça selecionada" tabIndex={0}><table><thead><tr><th>Critério</th><th>Segmento</th><th>Combinação</th><th>x segmento / peça</th><th>Esforços simultâneos</th></tr></thead><tbody>
        {demandComponents.flatMap(k=>{const ext=demands.critical[k];return ext?(["minimum","maximum"] as const).map(c=><tr key={`${k}-${c}`}><td>{labels[k]} {c==="minimum"?"mínimo":"máximo"}</td><ConcurrentRow row={rows.get(ext[c])!}/></tr>):[];})}
      </tbody></table></div>
      <p>Família declarada: {data.family??"pendente"}; aço: {data.physicalProperties.steelGrade}; A={show(data.physicalProperties.areaCm2)} cm²; Iy/Iz={show(data.physicalProperties.iyCm4)} / {show(data.physicalProperties.izCm4)} cm⁴. fy/fu={show(data.declaration?.fyMpa??null)} / {show(data.declaration?.fuMpa??null)} MPa.</p>
      <p>Contenções: {data.declaration?.restraintDescription||"pendentes"}. Fonte/revisão: {data.declaration?.source||"pendente"} / {data.declaration?.revision||"pendente"}.</p>
      <details><summary>Verificações e informações pendentes de {selectedPiece}</summary><ul>{data.verifications.map(v=><li key={v.id}><strong>{v.label}: PENDENTE</strong><ul>{v.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul></li>)}</ul></details>
      <details><summary>Controle analítico N/A — não normativo</summary><p>Tensão média axial; não inclui tensões extremas de flexão, flambagem ou interação.</p><ul>{[demands.critical.nN!.minimum,demands.critical.nN!.maximum].map((id,i)=><li key={i}>{rows.get(id)!.segmentId} / {rows.get(id)!.combinationId}: {show(data.analyticalControls.axialMeanStress.find(s=>s.sampleId===id)!.stressMPa)} MPa</li>)}</ul></details>
      <ResistantGeometryForm key={selectedPiece} project={project} pieceId={selectedPiece} onChange={onChange}/>
      <ColdFormedPropertiesForm key={`ue-${selectedPiece}`} project={project} pieceId={selectedPiece} onChange={onChange}/>
    </div>}
    <p style={{overflowWrap:"anywhere"}}>Entrada {report.binding.inputSha256}; resultado {report.binding.resultSha256}; relatório {report.reportSha256}.</p>
    <button type="button" className="button secondary" onClick={onExport}>Exportar relatório resistente preliminar</button>
  </section>;
}

function ResistantGeometryForm({project,pieceId,onChange}:{project:Project;pieceId:string;onChange:(p:Partial<Project>)=>void}){
  const d=project.workspace.spatialPreparation!,existing=d.resistance?.find(v=>v.pieceId===pieceId);
  const [shape,setShape]=useState(existing?.geometry?.shape??""),[designation,setDesignation]=useState(existing?.profileDesignation??"");
  const [source,setSource]=useState(existing?.geometry?.source??""),[revision,setRevision]=useState(existing?.geometry?.revision??"");
  const [dimensions,setDimensions]=useState<Record<string,string>>(Object.fromEntries(Object.entries(existing?.geometry?.dimensionsMm??{}).map(([k,v])=>[k,v===null?"":String(v)])));
  const [message,setMessage]=useState("");
  if(!existing)return <p>Para completar o cadastro, abra Preparação mista → Carregamentos físicos → Base resistente e registre os dados desta peça. Nenhum dado foi presumido.</p>;
  const fields={height:"Altura",width:"Largura",wallThickness:"Espessura de parede",webThickness:"Espessura de alma",flangeThickness:"Espessura de mesa",lip:"Enrijecedor",insideRadius:"Raio interno",diameter:"Diâmetro"};
  return <details><summary>Geometria física resistente de {pieceId}</summary><p>Dados independentes do desenho 3D e do catálogo comercial. Campos em branco permanecem pendentes. Registrar invalida a análise atual.</p>
    <Field label="Designação física resistente"><Input value={designation} maxLength={200} onChange={e=>setDesignation(e.target.value)}/></Field>
    <Field label="Forma física resistente"><Select value={shape} onChange={e=>setShape(e.target.value as typeof shape)}><option value="">Declare</option>{Object.entries({u:"U","u-stiffened":"U enrijecido",i:"I",rhs:"Tubular retangular",chs:"Tubular circular",angle:"Cantoneira",other:"Outra"}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
    <div className="form-grid">{Object.entries(fields).map(([k,v])=><Field key={k} label={`${v} física (mm)`}><Input value={dimensions[k]??""} onChange={e=>setDimensions({...dimensions,[k]:e.target.value})}/></Field>)}</div>
    <Field label="Fonte da geometria resistente"><Input value={source} maxLength={1000} onChange={e=>setSource(e.target.value)}/></Field><Field label="Revisão da geometria resistente"><Input value={revision} maxLength={1000} onChange={e=>setRevision(e.target.value)}/></Field>
    <button type="button" className="button secondary" onClick={()=>{try{
      const geometry=resistantSectionGeometrySchema.parse({version:1,basis:"physical-engineer-declaration",shape,source,revision,dimensionsMm:Object.fromEntries(Object.entries(dimensions).map(([k,v])=>[k,v.trim()?Number(v.replace(",",".")):null]))});
      const next=resistancePreparationSchema.parse({...existing,profileDesignation:designation,geometry});
      onChange({workspace:{...project.workspace,spatialPreparation:{...d,resistance:d.resistance!.map(v=>v.pieceId===pieceId?next:v)}}});
    }catch(e){setMessage((e as Error).message);}}}>Registrar geometria resistente e invalidar análise</button>{message&&<p role="status">{message}</p>}
  </details>;
}
