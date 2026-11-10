"use client";
import {useMemo,useState} from "react";
import type {Project} from "@/domain/models";
import type {SpatialPreparation} from "@/domain/spatial-preparation";
import type {PhysicalRoofFaces} from "@/domain/physical-roof-faces";
import {physicalRoofFacesSchema} from "@/domain/physical-roof-faces";
import {auditPhysicalRoofCoverage} from "@/domain/physical-roof-coverage";
import {declaredRoofDistributionSignature,distributeDeclaredRoofActions} from "@/domain/declared-roof-load-path";
import {parseRoofVertices,parseRoofHoles,formatRoofVertices,formatRoofHoles} from "@/domain/physical-roof-input";
import {resolvePhysicalStructure} from "@/domain/physical-structure";
import {emptyLoading,loadingDraftSchema} from "@/domain/structural-loading";
import {Field,Input,Select,Textarea} from "@/components/ui";
import {NumberField} from "@/components/number-field";

type Face=PhysicalRoofFaces["faces"][number];
type FaceForm={id:string;source:string;revision:string;outer:string;holes:string;memberIds:string[]};
type VectorInput=[number|null,number|null,number|null];
type ActionForm={caseId:string;knM2:number|null;projection:"horizontal"|"roof-surface";
  direction:VectorInput;source:string;revision:string;loadPath:string};
const blankFace=():FaceForm=>({id:"",source:"",revision:"",outer:"",holes:"",memberIds:[]});
const blankAction=():ActionForm=>({caseId:"",knM2:null,projection:"horizontal",direction:[0,0,-1],source:"",revision:"",loadPath:""});
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const getFace=(f:Face):FaceForm=>({id:f.id,source:f.source,revision:f.revision,
  outer:formatRoofVertices(f.outer),holes:formatRoofHoles(f.holes),memberIds:[...f.supportPieceIds]});

export function PhysicalRoofWorkflow({project,draft,onChange}:{
  project:Project;draft:SpatialPreparation;onChange:(draft:SpatialPreparation)=>void;
}){
  const [form,setForm]=useState<FaceForm>(blankFace);
  const [editing,setEditing]=useState("");
  const [memberChoice,setMemberChoice]=useState("");
  const [faceNotice,setFaceNotice]=useState("");
  const [actionForm,setActionForm]=useState<ActionForm>(blankAction);
  const [editingCase,setEditingCase]=useState("");
  const [actionNotice,setActionNotice]=useState("");
  const [auditResult,setAuditResult]=useState("");
  const physical=project.workspace.physicalStructure;
  const purlins=physical?.pieces.filter(p=>p.role==="purlin").map(p=>p.id)??[];
  const faces=draft.physicalRoofFaces?.faces??[];
  const loading=draft.loading??emptyLoading();
  const selectedCase=draft.cases.some(c=>c.id===actionForm.caseId)?actionForm.caseId:draft.cases[0]?.id??"";
  const physicalReview=useMemo(()=>{
    if(!draft.physicalRoofFaces)return {ready:false,message:"Nenhum pano físico declarado.",area:0};
    try{
      const model=resolvePhysicalStructure(project).model;
      if(!model)throw Error("Geometria física estrutural incompleta.");
      const checked=auditPhysicalRoofCoverage(draft.physicalRoofFaces,model);
      return {ready:true,message:"Áreas e relações com terças auditadas; transmissão das cargas ainda não homologada.",
        area:checked.horizontalAreaM2};
    }catch(e){return {ready:false,message:errorMessage(e),area:0};}
  },[draft.physicalRoofFaces,project]);
  const currentSignature=useMemo(()=>{
    try{return declaredRoofDistributionSignature(project);}
    catch{return "";}
  },[project]);
  const stale=!!loading.roofDistribution&&
    loading.roofDistribution.geometrySignature!==currentSignature;
  function resetFace(){setForm(blankFace());setEditing("");setMemberChoice("");}
  function saveFace(){
    try{
      const nextFace={id:form.id.trim(),outer:parseRoofVertices(form.outer),
        holes:parseRoofHoles(form.holes),supportPieceIds:form.memberIds,
        source:form.source.trim(),revision:form.revision.trim()};
      const pending=editing?faces.map(f=>f.id===editing?nextFace:f):[...faces,nextFace];
      const parsed=physicalRoofFacesSchema.parse({
        schema_version:"jpn.physical-roof-faces/1",units:"mm",
        source:nextFace.source,revision:nextFace.revision,faces:pending,
      });
      onChange({...draft,physicalRoofFaces:parsed,
        ...(draft.loading?{loading:{...draft.loading,roofDistribution:undefined}}:{})});
      setFaceNotice("Pano salvo; a antiga distribuição foi invalidada. Confira todos os encontros e revise as cargas.");
      setAuditResult("");resetFace();
    }catch(e){setFaceNotice("Não salvo: "+errorMessage(e));}
  }
  function removeFace(id:string){
    const rest=faces.filter(f=>f.id!==id);
    const next=rest.length?physicalRoofFacesSchema.parse({...draft.physicalRoofFaces,faces:rest}):undefined;
    onChange({...draft,physicalRoofFaces:next,
      ...(draft.loading?{loading:{...draft.loading,roofDistribution:undefined}}:{})});
    setFaceNotice("Pano removido; a distribuição anterior não pode ser reutilizada.");
    setAuditResult("");resetFace();
  }
  function saveAction(){
    try{
      if(!selectedCase||actionForm.knM2===null||actionForm.direction.some(v=>v===null))
        throw Error("Informe caso, pressão e três componentes numéricas do vetor.");
      const direction=actionForm.direction as [number,number,number];
      if(Math.abs(Math.hypot(...direction)-1)>1e-10)
        throw Error("O vetor da direção da carga deve ter módulo 1 (por exemplo 0; 0; -1).");
      const action={
        caseId:selectedCase,knM2:actionForm.knM2,projection:actionForm.projection,
        direction,source:actionForm.source.trim(),revision:actionForm.revision.trim(),
        loadPath:actionForm.loadPath.trim(),
      };
      if(draft.loads.some(l=>l.caseId===selectedCase)||loading.uniform.some(l=>l.caseId===selectedCase)||
        loading.selfWeight?.caseId===selectedCase||loading.wind?.cases.some(c=>c.id===selectedCase))
        throw Error("Caso já utilizado por outra carga; use um caso independente para evitar contagem dupla.");
      if(!editingCase&&loading.roofArea.some(a=>a.caseId===selectedCase))
        throw Error("Já existe uma ação de área neste caso; revise-a em vez de duplicá-la.");
      if(editingCase!==selectedCase&&editingCase&&loading.roofArea.some(a=>a.caseId===selectedCase))
        throw Error("Não é possível duplicar o caso de outra ação.");
      const next=editingCase?
        loading.roofArea.map(a=>a.caseId===editingCase?action:a):[...loading.roofArea,action];
      const validated=loadingDraftSchema.parse({...loading,roofArea:next});
      onChange({...draft,loading:validated});
      setActionNotice("Ação declarada. Pressão e direção ainda precisam passar pela distribuição física.");
      setAuditResult("");setActionForm(blankAction());setEditingCase("");
    }catch(e){setActionNotice("Não salva: "+errorMessage(e));}
  }
  function reviewDistribution(){
    try{
      if(!physicalReview.ready)throw Error("Revisão física dos panos e terças incompleta.");
      if(!loading.roofArea.length)throw Error("Declare pelo menos uma ação de cobertura.");
      const method={version:1 as const,method:"parallel-purlin-strips" as const,
        geometrySignature:declaredRoofDistributionSignature(project)};
      const withLoading=loadingDraftSchema.parse({...loading,roofDistribution:method});
      const next:SpatialPreparation={...draft,loading:withLoading};
      const candidate:Project={...project,workspace:{...project.workspace,spatialPreparation:next}};
      const audit=distributeDeclaredRoofActions(candidate,withLoading.roofArea,method);
      const total=audit.actions.reduce((sum,a)=>sum+a.distributedAreaM2,0);
      onChange(next);
      setAuditResult("Distribuição física conferida para "+audit.actions.length+" ação(ões), "+
        audit.regions.regions.length+" célula(s). Área acumulada das ações: "+
        total.toFixed(3)+" m². Forças e momentos conservados. Sem aprovação estrutural.");
      setActionNotice("");
    }catch(e){setAuditResult("Distribuição bloqueada: "+errorMessage(e));}
  }
  return <section className="technical-review" aria-label="Cobertura e cargas físicas declaradas" data-testid="physical-roof-workflow">
    <h4>Superfícies físicas e cargas de cobertura</h4>
    <p className="field-hint">Informe coordenadas medidas em mm e associe as terças do modelo real. O sistema não presume apoios, espessuras ou comportamento das telhas. Revisão de área não é aprovação estrutural.</p>
    <p className="notice" role="status">
      {physicalReview.ready?"Geometria física conferida": "Geometria pendente"} · {faces.length} pano(s) · {purlins.length} terça(s).
      {physicalReview.ready?" Área projetada declarada: "+physicalReview.area.toFixed(3)+" m².":" "+physicalReview.message}
      {stale?" A revisão das cargas está desatualizada.":""}
    </p>
    {faces.map(face=><div className="physical-row" key={face.id}>
      <strong>{face.id} · {face.supportPieceIds.length} terças · {face.revision}</strong>
      <button type="button" className="button secondary" onClick={()=>{
        setEditing(face.id);setForm(getFace(face));setFaceNotice("");
      }}>Editar pano {face.id}</button>
      <button type="button" className="button secondary" onClick={()=>removeFace(face.id)}>Remover pano {face.id}</button>
    </div>)}
    <details className="technical-details" open={editing?true:undefined}>
      <summary>{editing?"Editar pano físico "+editing:"Cadastrar novo pano físico"}</summary>
      <div className="form-grid">
        <Field label="ID do pano físico"><Input value={form.id} maxLength={80}
          onChange={e=>setForm({...form,id:e.target.value})}/></Field>
        <Field label="Fonte do levantamento XYZ"><Input value={form.source} maxLength={1000}
          onChange={e=>setForm({...form,source:e.target.value})}/></Field>
        <Field label="Revisão do pano físico"><Input value={form.revision} maxLength={1000}
          onChange={e=>setForm({...form,revision:e.target.value})}/></Field>
      </div>
      <Field label="Vértices externos em mm (X; Y; Z por linha, anti-horário)"
        hint="Exemplo: 0; 0; 3000 e 4000; 0; 3400. Não use separador de milhar. O fechamento exato é registrado automaticamente.">
        <Textarea rows={6} value={form.outer} onChange={e=>setForm({...form,outer:e.target.value})}/>
      </Field>
      <Field label="Recortes internos em mm (horário; linha vazia separa recortes)"
        hint="Não invente telhas dentro de aberturas. Contornos sobrepostos ou fora do pano são recusados.">
        <Textarea rows={4} value={form.holes} onChange={e=>setForm({...form,holes:e.target.value})}/>
      </Field>
      <div className="form-grid">
        <Field label="Terça existente para associar ao pano"><Select value={memberChoice} onChange={e=>setMemberChoice(e.target.value)}>
          <option value="">Escolha uma terça</option>
          {purlins.filter(id=>!form.memberIds.includes(id)).map(id=><option key={id} value={id}>{id}</option>)}
        </Select></Field>
        <button type="button" className="button secondary" disabled={!memberChoice||!purlins.includes(memberChoice)}
          onClick={()=>{setForm({...form,memberIds:[...form.memberIds,memberChoice]});setMemberChoice("");}}>
          Associar terça
        </button>
      </div>
      {form.memberIds.map(id=><button type="button" className="button secondary" key={id}
        onClick={()=>setForm({...form,memberIds:form.memberIds.filter(x=>x!==id)})}>Remover associação {id}</button>)}
      <div className="actions">
        <button type="button" className="button secondary" onClick={saveFace}>Salvar pano físico</button>
        <button type="button" className="button secondary" onClick={resetFace}>Limpar editor de pano</button>
      </div>
      {faceNotice&&<p role="status" className="notice">{faceNotice}</p>}
    </details>
    <h4>Ações declaradas de cobertura</h4>
    <p className="field-hint">Use um caso próprio para cada ação de área. A direção deve ser unitária; pressão, origem e revisão são obrigatórias. O vento normativo em fachadas continua bloqueado nesta etapa.</p>
    {loading.roofArea.map(a=><div key={a.caseId} className="physical-row">
      <strong>{a.caseId} · {a.knM2} kN/m² · {a.projection==="horizontal"?"projeção horizontal":"superfície inclinada"}</strong>
      <button type="button" className="button secondary" onClick={()=>{
        setEditingCase(a.caseId);setActionForm({...a});setActionNotice("");
      }}>Revisar ação {a.caseId}</button>
      <button type="button" className="button secondary" onClick={()=>{
        onChange({...draft,loading:{...loading,roofArea:loading.roofArea.filter(x=>x.caseId!==a.caseId)}});
        setAuditResult("Ação removida. Confira novamente os casos e as combinações.");setActionForm(blankAction());setEditingCase("");
      }}>Remover ação {a.caseId}</button>
    </div>)}
    <details className="technical-details" open={editingCase?true:undefined}>
      <summary>{editingCase?"Editar ação "+editingCase:"Registrar ação de área"}</summary>
      <div className="form-grid">
        <Field label="Caso físico da ação"><Select value={selectedCase} onChange={e=>setActionForm({...actionForm,caseId:e.target.value})}>
          {draft.cases.map(c=><option key={c.id} value={c.id}>{c.id}</option>)}
        </Select></Field>
        <NumberField label="Intensidade da pressão (kN/m²)" min={0} max={10000} decimals={5}
          value={actionForm.knM2} onChange={n=>setActionForm({...actionForm,knM2:n})}/>
        <Field label="Base de área de aplicação"><Select value={actionForm.projection}
          onChange={e=>setActionForm({...actionForm,projection:e.target.value as ActionForm["projection"]})}>
          <option value="horizontal">Área projetada horizontal</option>
          <option value="roof-surface">Área inclinada do pano</option>
        </Select></Field>
      </div>
      <div className="form-grid">
        {(["X","Y","Z"] as const).map((axis,i)=><NumberField key={axis}
          label={"Componente "+axis+" da direção unitária"} min={-1} max={1} decimals={6}
          value={actionForm.direction[i]} onChange={n=>{
            const direction=[...actionForm.direction] as VectorInput;direction[i]=n;
            setActionForm({...actionForm,direction});
          }}/>)}
      </div>
      <Field label="Origem da ação"><Input maxLength={1000} value={actionForm.source}
        onChange={e=>setActionForm({...actionForm,source:e.target.value})}/></Field>
      <Field label="Revisão da ação"><Input maxLength={1000} value={actionForm.revision}
        onChange={e=>setActionForm({...actionForm,revision:e.target.value})}/></Field>
      <Field label="Hipótese declarada de transmissão da telha à terça"><Textarea rows={2}
        maxLength={1000} value={actionForm.loadPath} onChange={e=>setActionForm({...actionForm,loadPath:e.target.value})}/></Field>
      <button type="button" className="button secondary" onClick={saveAction}>Salvar ação de área</button>
      {actionNotice&&<p role="status" className="notice">{actionNotice}</p>}
    </details>
    <div className="actions">
      <button type="button" className="button secondary" disabled={!faces.length||!loading.roofArea.length}
        onClick={reviewDistribution}>Conferir distribuição física das cargas</button>
    </div>
    {auditResult&&<p role="status" className="notice">{auditResult}</p>}
    <p className="field-hint">A verificação confirma somente superfície, faixas tributárias e conservação das resultantes. Cargas no PyNite, estabilidade, ELU/ELS, ligações e capacidade dos apoios exigem verificação posterior. Fabricação permanece bloqueada.</p>
  </section>;
}
