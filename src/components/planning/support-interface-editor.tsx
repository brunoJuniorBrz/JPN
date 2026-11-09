"use client";
import {useState} from "react";
import {Field,Input,Select,Textarea} from "@/components/ui";
import {NumberField} from "@/components/number-field";
import {supportInterfaceSchema} from "@/domain/support-interface";
import type {SupportInterface} from "@/domain/support-interface";
import type {SpatialPreparation} from "@/domain/spatial-preparation";

type CapacityKey="compressionKn"|"upliftKn"|"horizontalShearKn";
type FormState={nodeId:string;side:string;kind:string;source:string;revision:string;
  loadPath:string;restraintBasis:string;reviewStatus:"hypothesis"|"site-reviewed";
  capacities:Record<CapacityKey,number|null>;capacitySource:string;capacityRevision:string;};
const fresh=():FormState=>({nodeId:"",side:"",kind:"",source:"",revision:"",
  loadPath:"",restraintBasis:"",reviewStatus:"hypothesis",
  capacities:{compressionKn:null,upliftKn:null,horizontalShearKn:null},
  capacitySource:"",capacityRevision:""});
const kinds=[
 ["new-steel-column","Pilar metálico novo"],
 ["existing-masonry","Alvenaria existente"],
 ["existing-concrete","Concreto existente"],
 ["foundation","Fundação declarada"],
 ["other","Outro suporte verificado"],
] as const;
const axes=[
 ["compressionKn","Capacidade vertical à compressão (kN)"],
 ["upliftKn","Capacidade vertical ao arrancamento (kN)"],
 ["horizontalShearKn","Capacidade horizontal resultante (kN)"],
] as const;

export function SupportInterfaceEditor({draft,onChange}:{
  draft:SpatialPreparation;onChange:(next:SpatialPreparation)=>void;
}){
  const [form,setForm]=useState<FormState>(fresh);
  const [notice,setNotice]=useState("");
  const available=draft.supports.filter(s=>s.dofs.every(d=>d!=="pending")&&s.dofs.some(d=>d==="fixed"));
  const declared=available.find(s=>s.nodeId===form.nodeId);
  const includeCapacity=Object.values(form.capacities).some(x=>x!==null)||
    Boolean(form.capacitySource.trim()||form.capacityRevision.trim());
  const candidate={
    nodeId:form.nodeId,side:form.side,kind:form.kind,
    dofs:declared?.dofs.map(x=>x==="fixed"?"fixed":"free"),
    source:form.source,revision:form.revision,loadPath:form.loadPath,
    restraintBasis:form.restraintBasis,reviewStatus:form.reviewStatus,
    ...(includeCapacity?{capacity:{...form.capacities,source:form.capacitySource,
      revision:form.capacityRevision}}:{}),
  };
  const parsed=supportInterfaceSchema.safeParse(candidate);
  const update=(patch:Partial<FormState>)=>{setForm(old=>({...old,...patch}));setNotice("");};
  function load(face:SupportInterface){
    setForm({nodeId:face.nodeId,side:face.side,kind:face.kind,
      source:face.source,revision:face.revision,loadPath:face.loadPath,
      restraintBasis:face.restraintBasis,reviewStatus:face.reviewStatus,
      capacities:{compressionKn:face.capacity?.compressionKn??null,
        upliftKn:face.capacity?.upliftKn??null,
        horizontalShearKn:face.capacity?.horizontalShearKn??null},
      capacitySource:face.capacity?.source??"",
      capacityRevision:face.capacity?.revision??""});
    setNotice("Declaração carregada para edição. Confirme os vínculos atuais antes de salvar.");
  }
  return <section aria-label="Interfaces físicas de apoio" className="technical-review">
    <h4>Tipo físico e transferência para os apoios</h4>
    <p className="field-hint">Vincule cada parede, pilar ou apoio em concreto a um nó que já tenha vínculos físicos explícitos. As restrições são copiadas somente ao salvar esta revisão; nenhuma parede vira engaste automaticamente.</p>
    {(draft.supportInterfaces??[]).map(face=><div className="physical-row" key={face.nodeId}>
      <strong>{face.nodeId} · {kinds.find(k=>k[0]===face.kind)?.[1]??face.kind} · lado {face.side}</strong>
      <button type="button" className="button secondary" onClick={()=>load(face)}>Revisar interface</button>
      <button type="button" className="button secondary" onClick={()=>onChange({...draft,
        supportInterfaces:(draft.supportInterfaces??[]).filter(x=>x.nodeId!==face.nodeId)})}>Remover interface</button>
    </div>)}
    <details className="technical-details">
      <summary>Registrar ou atualizar interface física de apoio</summary>
      <div className="form-grid">
        <Field label="Nó com vínculos já declarados"><Select value={form.nodeId} onChange={e=>update({nodeId:e.target.value})}>
          <option value="">Selecione nó real</option>
          {available.map(s=><option key={s.nodeId} value={s.nodeId}>{s.nodeId}</option>)}
        </Select></Field>
        <Field label="Lado da obra"><Select value={form.side} onChange={e=>update({side:e.target.value})}>
          <option value="">Selecione o lado físico</option>
          <option value="A">Lado A</option><option value="B">Lado B</option><option value="internal">Apoio interno</option>
        </Select></Field>
        <Field label="Tipo de elemento que recebe os esforços"><Select value={form.kind} onChange={e=>update({kind:e.target.value})}>
          <option value="">Selecione o tipo real</option>{kinds.map(([v,label])=><option key={v} value={v}>{label}</option>)}
        </Select></Field>
        <Field label="Situação da revisão"><Select value={form.reviewStatus}
          onChange={e=>update({reviewStatus:e.target.value as FormState["reviewStatus"]})}>
          <option value="hypothesis">Hipótese ainda sem inspeção</option>
          <option value="site-reviewed">Inspeção de obra registrada pelo responsável</option>
        </Select></Field>
        <Field label="Fonte do levantamento"><Input maxLength={1000} value={form.source}
          onChange={e=>update({source:e.target.value})}/></Field>
        <Field label="Revisão / data"><Input maxLength={1000} value={form.revision}
          onChange={e=>update({revision:e.target.value})}/></Field>
      </div>
      <Field label="Como a carga passa da barra para o apoio"><Textarea rows={2} maxLength={1000}
        value={form.loadPath} onChange={e=>update({loadPath:e.target.value})}/></Field>
      <Field label="Justificativa dos seis vínculos físicos"><Textarea rows={2} maxLength={1000}
        value={form.restraintBasis} onChange={e=>update({restraintBasis:e.target.value})}/></Field>
      <p className="field-hint">Capacidades abaixo são opcionais. Preencha somente valores calculados/confirmados com fonte e revisão; a ausência continuará pendente. Estes campos não executam o dimensionamento de alvenaria, concreto ou ancoragens.</p>
      <div className="form-grid">
        {axes.map(([key,label])=><NumberField key={key} label={label} value={form.capacities[key]}
          min={0} max={1e9} decimals={3} onChange={value=>update({capacities:{...form.capacities,[key]:value}})}/>)}
        <Field label="Fonte das capacidades declaradas"><Input value={form.capacitySource} maxLength={1000}
          onChange={e=>update({capacitySource:e.target.value})}/></Field>
        <Field label="Revisão das capacidades"><Input value={form.capacityRevision} maxLength={1000}
          onChange={e=>update({capacityRevision:e.target.value})}/></Field>
      </div>
      {declared && <p className="field-hint">Nó {declared.nodeId}, graus de liberdade existentes: {declared.dofs.join(" / ")}. A seleção de um tipo físico não altera esses graus.</p>}
      {!parsed.success&&<p className="field-hint">Preencha nó, lado, tipo e todas as fontes/justificativas (mínimo 5 caracteres). Para informar capacidades, registre também fonte e revisão.</p>}
      <div className="actions">
        <button type="button" className="button secondary" disabled={!parsed.success}
          onClick={()=>{
            if(!parsed.success)return;
            onChange({...draft,supportInterfaces:[...(draft.supportInterfaces??[]).filter(x=>x.nodeId!==parsed.data.nodeId),parsed.data]});
            setForm(fresh());setNotice("Interface registrada. O preflight ainda precisa conferir a obra e o solver.");
          }}>Salvar interface física</button>
        <button type="button" className="button secondary" onClick={()=>{setForm(fresh());setNotice("");}}>Limpar formulário</button>
      </div>
    </details>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
