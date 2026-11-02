"use client";
import { useEffect,useRef,useState } from "react";
import type { Project } from "@/domain/models";
import type { ResistanceReport } from "@/domain/resistance-report";
import { criticalKeys,memberDesignBasis,memberDesignDeclarationSchema,prepareColdformedDesign,coldformedDesignResultSchema,type MemberDesignDeclaration } from "@/domain/coldformed-design";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { Field,Input,Select } from "@/components/ui";
import { downloadText } from "@/lib/format";

type Props={project:Project;report:ResistanceReport;pieceId:string;onChange:(p:Partial<Project>)=>void};
export function ColdformedDesignControl(props:Props){
  const combos=props.project.workspace.spatialPreparation?.engineeringCombinations?.combinations.filter(c=>c.purpose==="ULS")??[];
  const [combo,setCombo]=useState(combos[0]?.id??"");
  const d=props.project.workspace.spatialPreparation?.resistance?.find(d=>d.pieceId===props.pieceId);
  if(d?.family!=="cold-formed"||d.geometry?.shape!=="u-stiffened")return null;
  return <details data-testid="coldformed-design"><summary>Verificar resistência Ue — NBR 14762:2010 / MRD</summary>
    <p>Calcula compressão C.3, flexão C.4, tração 9.6.2, cortante de uma alma sem enrijecedores 9.8.3 e interação 9.9 onde aplicáveis. Aprovar esses procedimentos não aprova a peça inteira, ligações, estabilidade global ou fabricação. Combinações e valores críticos precisam de estudo e revisão explícitos.</p>
    <Field label="Combinação ULS para verificar"><Select value={combo} onChange={e=>setCombo(e.target.value)}><option value="">Selecione</option>{combos.map(c=><option key={c.id} value={c.id}>{c.id}</option>)}</Select></Field>
    {combo?<DesignForm key={`${props.pieceId}:${combo}`} {...props} combinationId={combo}/>:<p>Declare combinações ULS antes de verificar.</p>}
  </details>;
}
const labels={compression:"Compressão (kN)",my_positive:"My positivo (kN·m)",my_negative:"My negativo (kN·m)",mz_positive:"Mz positivo (kN·m)",mz_negative:"Mz negativo (kN·m)"};
const numeric=(v:string)=>Number(v.replace(",","."));
function DesignForm({project,report,pieceId,combinationId,onChange}:Props&{combinationId:string}){
  const draft=project.workspace.spatialPreparation!,existing=draft.memberDesign?.find(d=>d.pieceId===pieceId&&d.combinationId===combinationId);
  const [values,setValues]=useState(()=>Object.fromEntries(criticalKeys.map(k=>[k,Object.fromEntries(["global","local","distortional"].map(m=>[m,existing?.critical[k]?String(existing.critical[k][m as "global"] /1000):""]))])));
  const [source,setSource]=useState(existing?.study.source??""),[revision,setRevision]=useState(existing?.study.revision??""),[responsible,setResponsible]=useState(existing?.study.responsible??""),[conditions,setConditions]=useState(existing?.study.boundary_and_load_pattern??"");
  const [netOutside,setNetOutside]=useState(existing?.tension?.basis==="declared-net-areas"?String(existing.tension.net_outside_m2*1e4):""),[netConnection,setNetConnection]=useState(existing?.tension?.basis==="declared-net-areas"?String(existing.tension.net_connection_m2*1e4):""),[ct,setCt]=useState(existing?.tension?.basis==="declared-net-areas"?String(existing.tension.ct):"");
  const [tensionSource,setTensionSource]=useState(existing?.tension?.source??""),[tensionRevision,setTensionRevision]=useState(existing?.tension?.revision??"");
  const [confirmed,setConfirmed]=useState(false),[web,setWeb]=useState(existing?.unstiffenedSingleWeb??false),[basis,setBasis]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [tensionBasis,setTensionBasis]=useState(existing?.tension?.basis??"declared-net-areas");
  const [studyType,setStudyType]=useState(existing?.study.minimum_search??"reviewed-elastic-mode-minima");
  const controller=useRef<AbortController|null>(null),[computed,setComputed]=useState<{identity:string;record:unknown;result:ReturnType<typeof coldformedDesignResultSchema.parse>}|null>(null);
  const identity=JSON.stringify([values,source,revision,responsible,conditions,netOutside,netConnection,ct,tensionSource,tensionRevision,confirmed,web,basis,studyType,tensionBasis]);
  const current=computed?.identity===identity?computed:null;
  useEffect(()=>{let mounted=true;memberDesignBasis(project,report,pieceId).then(hash=>{if(mounted)setBasis(hash);}).catch(e=>{if(mounted)setMessage(e.message);});return()=>{mounted=false;controller.current?.abort();};},[project,report,pieceId]);
  function declaration():MemberDesignDeclaration{
    if(!confirmed)throw Error(studyType==="not-required-pure-tension"?"Confirme a hipótese de tração axial pura.":"Confirme o estudo elástico e os mínimos por modo; não basta copiar o menor ponto de uma curva sem classificação.");
    return memberDesignDeclarationSchema.parse({schema_version:"jpn.member-design-declaration/1",pieceId,combinationId,
      study:{source,revision,responsible,basis_sha256:basis,boundary_and_load_pattern:conditions,minimum_search:studyType},
      critical:Object.fromEntries(criticalKeys.map(k=>[k,Object.values(values[k]).every(v=>!v.trim())?null:Object.fromEntries(Object.entries(values[k]).map(([m,v])=>[m,v.trim()?numeric(v)*1000:null]))])),
      tension:tensionBasis==="full-section-all-elements-welded"?{basis:tensionBasis,source:tensionSource,revision:tensionRevision}:[netOutside,netConnection,ct].every(v=>!v.trim())?null:{basis:tensionBasis,net_outside_m2:numeric(netOutside)*1e-4,net_connection_m2:numeric(netConnection)*1e-4,ct:numeric(ct),source:tensionSource,revision:tensionRevision},unstiffenedSingleWeb:web,
    });
  }
  return <div>
    <Field label="Domínio do estudo resistente"><Select value={studyType} onChange={e=>setStudyType(e.target.value as typeof studyType)}><option value="reviewed-elastic-mode-minima">Estabilidade elástica com mínimos por modo revisados</option><option value="not-required-pure-tension">Somente tração axial pura, sem modos comprimidos</option></Select></Field>
    <p>Valores críticos positivos, calculados para esta peça, contenções e padrão de esforços. Campos vazios deixam o procedimento correspondente bloqueado. Não são gerados ou classificados automaticamente pelo pyCUFSM.</p>
    {existing&&existing.study.basis_sha256!==basis&&<p role="alert">Estudo crítico desatualizado: revise os valores e registre a nova revisão.</p>}
    {criticalKeys.map(k=><fieldset key={k}><legend>{labels[k]}</legend><div className="form-grid">{Object.entries({global:"Global",local:"Local",distortional:"Distorcional"}).map(([m,label])=><Field key={m} label={`Crítico ${k} ${label}`}><Input value={values[k][m]} onChange={e=>setValues({...values,[k]:{...values[k],[m]:e.target.value}})}/></Field>)}</div></fieldset>)}
    <Field label="Fonte do estudo crítico"><Input value={source} maxLength={1000} onChange={e=>setSource(e.target.value)}/></Field><Field label="Revisão do estudo crítico"><Input value={revision} maxLength={1000} onChange={e=>setRevision(e.target.value)}/></Field><Field label="Responsável pelo estudo crítico"><Input value={responsible} maxLength={1000} onChange={e=>setResponsible(e.target.value)}/></Field><Field label="Contenções e padrão de esforços do estudo"><Input value={conditions} maxLength={1000} onChange={e=>setConditions(e.target.value)}/></Field>
    <p>Tração: áreas críticas e Ct precisam de determinação independente da ligação e dos furos. Esta etapa não transforma uma área digitada em seção líquida governante comprovada.</p>
    <Field label="Hipótese da seção tracionada"><Select value={tensionBasis} onChange={e=>setTensionBasis(e.target.value as typeof tensionBasis)}><option value="declared-net-areas">Áreas líquidas e Ct de estudo independente</option><option value="full-section-all-elements-welded">Barra sem furos/recortes; todos os elementos ligados por soldas</option></Select></Field>
    <Field label="Área líquida fora da ligação (cm²)"><Input value={netOutside} onChange={e=>setNetOutside(e.target.value)}/></Field><Field label="Área líquida na ligação (cm²)"><Input value={netConnection} onChange={e=>setNetConnection(e.target.value)}/></Field><Field label="Ct da ligação"><Input value={ct} onChange={e=>setCt(e.target.value)}/></Field><Field label="Fonte da seção líquida e Ct"><Input value={tensionSource} maxLength={1000} onChange={e=>setTensionSource(e.target.value)}/></Field><Field label="Revisão da seção líquida e Ct"><Input value={tensionRevision} maxLength={1000} onChange={e=>setTensionRevision(e.target.value)}/></Field>
    <label><input type="checkbox" checked={web} onChange={e=>setWeb(e.target.checked)}/> Declaro uma única alma sem enrijecedores transversais, com altura plana e espessura da geometria física.</label>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> {studyType==="not-required-pure-tension"?"Declaro somente tração axial pura; o motor recusará compressão, flexão, cortante ou torção nesta hipótese.":"Estudo elástico revisado: mínimos global/local/distorcional e condições compatíveis com esta combinação."}</label>
    <div className="actions"><button type="button" className="button secondary" disabled={busy||!basis} onClick={()=>{try{const value=declaration();onChange({workspace:{...project.workspace,spatialPreparation:{...draft,memberDesign:[...(draft.memberDesign??[]).filter(x=>x.pieceId!==pieceId||x.combinationId!==combinationId),value]}}});}catch(e){setMessage((e as Error).message);}}}>Registrar estudo crítico e invalidar análise</button>
      <button type="button" className="button" disabled={busy||!existing||!basis} onClick={async()=>{setMessage("");setComputed(null);try{
        const d=declaration();if(await mixedInputHash(d)!==await mixedInputHash(existing))throw Error("Registre os dados revisados e recalcule a análise antes de verificar.");
        const input=await prepareColdformedDesign(project,report,d),abort=new AbortController();controller.current=abort;setBusy(true);
        const response=await fetch("/api/experimental/design",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:abort.signal}),body=await response.json();if(!response.ok)throw Error(body.error?.message??"Verificação recusada.");
        const result=coldformedDesignResultSchema.parse(body.result);if(result.input_sha256!==await mixedInputHash(input))throw Error("Resposta não corresponde às entradas físicas atuais.");
        if(!abort.signal.aborted)setComputed({identity,record:{schema_version:"jpn.member-design-record/1",request:input,result},result});
      }catch(e){if(!controller.current?.signal.aborted)setMessage((e as Error).message);}finally{setBusy(false);}}}>Executar verificação resistente Python</button></div>
    {message&&<p role="alert">{message}</p>}{busy&&<p role="status">Executando verificação resistente em processo Python separado…</p>}
    {current&&<div data-testid="coldformed-design-result"><p><strong>{current.result.status}</strong> — somente procedimentos executados. Peça completa, estrutura e fabricação não aprovadas.</p>
      <ul>{current.result.checks.map(c=><li key={c.id}>{c.id}: <strong>{c.status}</strong>{"reason" in c?` — ${c.reason}`:`; utilização ${c.utilization.toPrecision(7)}; demanda ${c.demand.toExponential(6)} / resistência ${c.resistance.toExponential(6)} (SI); cláusulas ${c.clauses.join(", ")}; posição ${c.governing?.position_m??"não aplicável"} m`}</li>)}</ul>
      <button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify(current.record,null,2),`resistance-${pieceId}-${combinationId}.json`)}>Exportar cálculo resistente rastreável</button>
    </div>}
  </div>;
}
