"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import { declaredDraft,editDeclaredStructure,removeDeletedReferences } from "@/domain/edit-declared-structure";
import { physicalRoles as roles,roleLabels } from "@/domain/structure";
import { Field,Input,Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";

export function DeclaredStructureEditor({project,onCommit}:{project:Project;onCommit:(project:Project)=>void}){
  const [draft,setDraft]=useState(()=>declaredDraft(project)),[node,setNode]=useState(""),[xyz,setXyz]=useState<(number|null)[]>([null,null,null]);
  const [piece,setPiece]=useState(""),[start,setStart]=useState(""),[end,setEnd]=useState(""),[role,setRole]=useState<typeof roles[number]>("topChord"),[label,setLabel]=useState(""),[group,setGroup]=useState("");
  const [error,setError]=useState("");
  const text=(name:string,value:string,change:(v:string)=>void)=><Field label={name}><Input maxLength={1000} value={value} onChange={e=>change(e.target.value)}/></Field>;
  return <details className="technical-details" data-testid="declared-geometry-editor"><summary>Criar ou editar estrutura irregular por nós e barras</summary>
    <p>Coordenadas físicas em mm. Vigas, pilares, terças e treliças não são gerados por suposição. Registre a revisão completa antes de mudar de etapa; apoios, propriedades e cargas serão conferidos separadamente.</p>
    <div className="form-grid">{text("Revisão da geometria declarada",draft.revision,v=>setDraft({...draft,revision:v}))}{text("Fonte da geometria declarada",draft.provenance,v=>setDraft({...draft,provenance:v}))}</div>
    <h4>Nós</h4><div className="form-grid">{text("ID do nó",node,setNode)}{xyz.map((v,i)=><NumberField key={i} label={`Coordenada ${"XYZ"[i]} do nó (mm)`} value={v} min={-10000000} max={10000000} onChange={n=>setXyz(xyz.map((x,j)=>i===j?n:x))}/>)}</div>
    <button type="button" className="button secondary" onClick={()=>{if(!node.trim()||xyz.some(v=>v===null)){setError("Informe ID e três coordenadas, inclusive zeros.");return;}setDraft({...draft,nodes:[...draft.nodes.filter(n=>n.id!==node),{id:node,x:xyz[0]!,y:xyz[1]!,z:xyz[2]!}]});setNode("");setXyz([null,null,null]);setError("");}}>Adicionar ou atualizar nó</button>
    <ul>{draft.nodes.map(n=><li key={n.id}>{n.id}: ({n.x}; {n.y}; {n.z}) mm <button type="button" className="button secondary" onClick={()=>{setNode(n.id);setXyz([n.x,n.y,n.z]);}}>Editar nó {n.id}</button> <button type="button" className="button secondary" onClick={()=>setDraft({...draft,nodes:draft.nodes.filter(x=>x.id!==n.id)})}>Remover nó {n.id}</button></li>)}</ul>
    <h4>Barras</h4><div className="form-grid">{text("ID da barra",piece,setPiece)}
      <Field label="Nó inicial da barra"><Select value={start} onChange={e=>setStart(e.target.value)}><option value="">Selecione</option>{draft.nodes.map(n=><option key={n.id}>{n.id}</option>)}</Select></Field>
      <Field label="Nó final da barra"><Select value={end} onChange={e=>setEnd(e.target.value)}><option value="">Selecione</option>{draft.nodes.map(n=><option key={n.id}>{n.id}</option>)}</Select></Field>
      <Field label="Grupo físico herdado da barra"><Select value={role} onChange={e=>setRole(e.target.value as typeof role)}>{roles.map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</Select></Field>
      <Field label="Função identificada da barra"><Select value={label} onChange={e=>setLabel(e.target.value)}><option value="">Usar identificação do grupo</option>{["Viga","Pilar","Terça","Banzo superior","Banzo inferior","Diagonal","Montante"].map(v=><option key={v}>{v}</option>)}</Select></Field>{text("Organização / grupo da barra",group,setGroup)}</div>
    <button type="button" className="button secondary" onClick={()=>{if(!piece.trim()||!start||!end||start===end){setError("Informe ID e dois nós distintos existentes.");return;}setDraft({...draft,pieces:[...draft.pieces.filter(p=>p.id!==piece),{id:piece,start,end,role,...(label?{label}:{}),...(group?{group}:{})}]});setPiece("");setError("");}}>Adicionar ou atualizar barra</button>
    <ul>{draft.pieces.map(p=><li key={p.id}>{p.id}: {p.start} → {p.end} · {p.label||roleLabels[p.role]} · {p.group||"sem grupo adicional"} <button type="button" className="button secondary" onClick={()=>{setPiece(p.id);setStart(p.start);setEnd(p.end);setRole(p.role);setLabel(p.label??"");setGroup(p.group??"");}}>Editar barra {p.id}</button> <button type="button" className="button secondary" onClick={()=>setDraft({...draft,pieces:draft.pieces.filter(x=>x.id!==p.id)})}>Remover barra {p.id}</button></li>)}</ul>
    <button type="button" className="button" onClick={()=>{try{onCommit(editDeclaredStructure(project,draft));setError("");}catch(e){setError((e as Error).message);}}}>Registrar geometria e invalidar dependências</button>
    <p>Não altera o orçamento manual. Ao editar coordenadas, revise conectividade e vínculos físicos antes de calcular ou atualizar quantitativos. Barras sobrepostas, nós sem barras e referências inválidas são recusados no registro.</p>
    {project.workspace.physicalStructure&&<button type="button" className="button secondary" onClick={()=>onCommit(removeDeletedReferences(project))}>Remover referências de nós e barras excluídos</button>}
    {error&&<p role="alert">{error}</p>}
  </details>;
}
