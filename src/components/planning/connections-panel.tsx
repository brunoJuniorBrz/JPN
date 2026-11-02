"use client";
import { useMemo,useState } from "react";
import type { Project } from "@/domain/models";
import type { ConnectionReport } from "@/domain/connection-report";
import type { ConnectionDeclaration } from "@/domain/connections";
import { physicalConnectionNodes,saveConnectionDeclaration } from "@/domain/connection-declaration";
import { Field,Input,Select } from "@/components/ui";
import { ConnectionGeometryControl } from "./connection-geometry-control";

const vec=(v:number[]|null)=>v?v.map(n=>n===0?"0":n.toExponential(5)).join("; "):"Não aplicável ao modelo axial";
export function ConnectionsPanel({project,report,combinationId,selectedNode,onSelectNode,onSelectPiece,onChange,onExport}:{project:Project;report:ConnectionReport|null;combinationId:string;selectedNode:string;onSelectNode:(id:string)=>void;onSelectPiece:(id:string)=>void;onChange:(p:Partial<Project>)=>void;onExport:()=>void}){
  const physical=useMemo(()=>{try{return {nodes:physicalConnectionNodes(project),error:""};}catch(e){return {nodes:[],error:(e as Error).message};}},[project]);
  const node=physical.nodes.find(n=>n.nodeId===selectedNode)??physical.nodes[0],combo=report?.combinations.find(c=>c.combinationId===combinationId)??report?.combinations[0];
  const actions=combo?.joints.find(j=>j.nodeId===node?.nodeId),state=report?.physicalNodes.find(n=>n.nodeId===node?.nodeId);
  return <section className="notice" data-testid="connections-panel" aria-label="Ligações e estabilidade experimental">
    <h4>Ligações e estabilidade — M24 parcial</h4><p>Encontro no modelo, declaração construtiva, ações calculadas, resistência verificada e fabricação aprovada são estados distintos. Nenhuma resistência de ligação ou estabilidade normativa é aprovada aqui.</p>
    {physical.error&&<p>{physical.error}</p>}
    {node&&<><Field label="Nó ou ligação física"><Select value={node.nodeId} onChange={e=>onSelectNode(e.target.value)}>{physical.nodes.map(n=><option key={n.nodeId} value={n.nodeId}>{n.nodeId} · {n.pieceIds.join(", ")}</option>)}</Select></Field>
      <p>Posição global XYZ: {node.positionMm.map(v=>v/1000).join("; ")} m. Participantes do modelo físico:</p><div className="actions">{node.pieceIds.map(id=><button type="button" key={id} className="button secondary" onClick={()=>onSelectPiece(id)}>Inspecionar {id}</button>)}</div>
      {actions&&combo&&report?<div data-testid="connection-actions" data-node-id={node.nodeId}>
        <p>Combinação {combo.combinationId}. Ações abaixo são da BARRA SOBRE O NÓ, em XYZ global. A ação nativa nó sobre barra tem sinal oposto.</p>
        <div role="region" aria-label="Ações de extremidade na ligação" tabIndex={0} style={{overflowX:"auto"}}><table><thead><tr><th>Peça / segmento / extremo</th><th>Força XYZ (N)</th><th>Momento XYZ (N·m)</th><th>Origem</th></tr></thead><tbody>{actions.ends.map(e=><tr key={`${e.segmentId}-${e.end}`}><td>{e.pieceId} / {e.segmentId} / {e.end}</td><td>{vec(e.memberOnNodeGlobal.forceN)}</td><td>{vec(e.memberOnNodeGlobal.momentNm)}</td><td>{e.originalPieceEnd?"Extremidade original":"Corte interno contínuo; não é emenda"}</td></tr>)}</tbody></table></div>
        <p>Carga externa nodal compilada: F={vec(actions.externalNodal.forceN)} N; M={vec(actions.externalNodal.momentNm)} N·m.</p>
        <p>{actions.support?"Reação do apoio SOBRE a estrutura":"Sem apoio físico declarado neste nó"}: F={vec(actions.reaction.forceN)} N; M={vec(actions.reaction.momentNm)} N·m. A transferência à fundação tem sinal oposto à reação.</p>
        <p data-testid="connection-equilibrium">Resíduo: F={vec(actions.residual.forceN)} N; M={vec(actions.residual.momentNm)} N·m; norma equivalente {actions.balance.residualEquivalentN.toExponential(4)} N ≤ {actions.balance.limitEquivalentN.toExponential(4)} N. Conferido nesta combinação.</p>
        <p>DOFs de translação: {actions.dofs.translation.join("; ")}; rotações: {actions.dofs.rotation?.join("; ")??"inativas no nó exclusivamente axial; não são apoios fictícios"}.</p>
        <p>{state?.state.physicallyDeclared?"Ligação fisicamente declarada.":"Ligação identificada; tipo físico ainda não declarado."} {state?.state.hypothesisConsistent?"Hipótese compatível com o modelo analisado.":"Hipótese física pendente/incompatível; revise antes de utilizar as ações para detalhamento."}</p>
        <ul>{state?.issues.map((s,i)=><li key={i}>{s}</li>)}</ul>
        <p>Resistência de parafusos, soldas, chapas e ancoragens: PENDENTE. Fabricação NÃO APROVADA.</p>
        <p>Diagnóstico: primeira ordem numericamente resolvida, {report.diagnostics.free_dofs} DOFs livres, condição escalada {report.diagnostics.scaled_condition.toExponential(5)}. Isso não comprova estabilidade estrutural normativa. Segunda ordem não verificada.</p>
        <button type="button" className="button secondary" onClick={onExport}>Exportar ações e diagnóstico de ligações</button>
      </div>:<p>Sem ações atuais de ligação. Use “Calcular ações de ligações” para obter a transformação nativa do PyNite; não são somados esforços locais sem essa referência.</p>}
      <ConnectionForm key={`${project.id}:${node.nodeId}`} project={project} nodeId={node.nodeId} pieceIds={node.pieceIds} onChange={onChange}/>
      <ConnectionGeometryControl key={`geometry-${node.nodeId}`} project={project} nodeId={node.nodeId} onChange={onChange}/>
    </>}
  </section>;
}

function ConnectionForm({project,nodeId,pieceIds,onChange}:{project:Project;nodeId:string;pieceIds:string[];onChange:(p:Partial<Project>)=>void}){
  const existing=project.workspace.spatialPreparation?.connections?.connections.find(c=>c.nodeId===nodeId);
  const [id,setId]=useState(existing?.id??""),[typology,setTypology]=useState(existing?.typology??""),[hypothesis,setHypothesis]=useState(existing?.transferHypothesis??"");
  const [source,setSource]=useState(existing?.source??""),[revision,setRevision]=useState(existing?.revision??""),[responsible,setResponsible]=useState(existing?.responsible??"");
  const [offset,setOffset]=useState(existing?.offsetGlobalM?.map(String)??["","",""]),[behaviors,setBehaviors]=useState<Record<string,string>>(Object.fromEntries(pieceIds.map(id=>[id,existing?.participants.find(p=>p.pieceId===id)?.behavior??"pending"])));
  const [components,setComponents]=useState<ConnectionDeclaration["components"]>(existing?.components??[]),[message,setMessage]=useState("");
  const input=(label:string,value:string,set:(s:string)=>void)=><Field key={label} label={label}><Input value={value} maxLength={1000} onChange={e=>set(e.target.value)}/></Field>;
  function add(kind:ConnectionDeclaration["components"][number]["kind"]){const common={id:`${kind}-${crypto.randomUUID().slice(0,8)}`,source:"",revision:""};
    const c=kind==="plate"?{...common,kind,widthMm:null,heightMm:null,thicknessMm:null,material:null}:kind==="bolts"?{...common,kind,quantity:null,diameterMm:null,grade:null,arrangement:null,holesAndDistances:null}:kind==="weld"?{...common,kind,type:null,position:null,sizeMm:null,lengthMm:null,material:null}:{...common,kind,pieceId:null,description:null};
    setComponents([...components,c]);}
  return <details data-testid="connection-form"><summary>Declarar ou revisar ligação em {nodeId}</summary><p>A declaração não altera apoios, liberações ou rigidezes do solver. Se a hipótese diferir do modelo, o relatório exigirá revisão explícita. Dados desconhecidos permanecem pendentes.</p>
    <div className="form-grid">{input("ID da ligação",id,setId)}<Field label="Tipologia da ligação"><Select value={typology} onChange={e=>setTypology(e.target.value as typeof typology)}><option value="">Declare</option>{Object.entries({"purlin-support":"Terça sobre tesoura/viga","truss-joint":"Membros de treliça","beam-column":"Viga/pilar","column-base":"Base de pilar/ancoragem",splice:"Emenda física explícita"}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>
    {pieceIds.map(id=><Field key={id} label={`Transferência de ${id}`}><Select value={behaviors[id]} onChange={e=>setBehaviors({...behaviors,[id]:e.target.value})}>{Object.entries({pending:"Pendente","as-modeled":"Conforme análise revisada",rigid:"Rígida",pinned:"Articulada",axial:"Exclusivamente axial","semi-rigid":"Semirrígida — não suportada"}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Field>)}
    {input("Hipótese de transferência",hypothesis,setHypothesis)}{offset.map((v,i)=>input(`Excentricidade global ${"XYZ"[i]} (m)`,v,s=>setOffset(offset.map((x,j)=>i===j?s:x))))}{input("Fonte da ligação",source,setSource)}{input("Revisão da ligação",revision,setRevision)}{input("Responsável pela ligação",responsible,setResponsible)}</div>
    <p>Geometria e componentes abaixo são apenas declarações físicas, sem dimensionamento nem quantitativo comercial.</p><div className="actions">{(["plate","bolts","weld","restraint"] as const).map(kind=><button type="button" key={kind} className="button secondary" onClick={()=>add(kind)}>Adicionar {({plate:"chapa",bolts:"conjunto de parafusos",weld:"solda",restraint:"contenção"})[kind]} pendente</button>)}</div>
    {components.map((component,i)=><details key={`${i}-${component.kind}`}><summary>{component.kind} · {component.id}</summary><div className="form-grid">{Object.entries(component).filter(([k])=>k!=="kind").map(([key,value])=>input(`${component.kind} ${i+1} — ${key}${key.endsWith("Mm")?" (mm)":""}`,value===null?"":String(value),s=>setComponents(components.map((c,j)=>j===i?{...c,[key]:key.endsWith("Mm")||key==="quantity"?(s.trim()?Number(s.replace(",",".")):null):["id","source","revision"].includes(key)?s:s||null} as typeof c:c))))}</div><button type="button" className="button secondary" onClick={()=>setComponents(components.filter((_,j)=>i!==j))}>Remover componente {i+1}</button></details>)}
    <button type="button" className="button secondary" onClick={()=>{try{
      const offsetGlobalM=offset.every(v=>!v.trim())?null:offset.map(v=>{if(!v.trim())throw new Error("Declare três excentricidades, inclusive zeros explícitos, ou deixe todas pendentes.");return Number(v.replace(",","."));});
      const next=saveConnectionDeclaration(project,{...existing,id,nodeId,typology,participants:pieceIds.map(pieceId=>({pieceId,behavior:behaviors[pieceId]})),transferHypothesis:hypothesis,offsetGlobalM,stiffness:existing?.stiffness??null,components,source,revision,responsible});onChange({workspace:next.workspace});setMessage("Declaração registrada. Análise e relatórios anteriores invalidados; reexecute após revisar o modelo físico.");
    }catch(e){setMessage((e as Error).message);}}}>Registrar ligação e invalidar análise</button>{message&&<p role="status">{message}</p>}
  </details>;
}
