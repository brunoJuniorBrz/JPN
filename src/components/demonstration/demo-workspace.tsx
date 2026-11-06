"use client";
import {useMemo,useState} from "react";
import { HardDrive, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useData} from "@/components/data-provider";
import {Field,Input,PageHeading,Textarea} from "@/components/ui";
import {projectSchema,type Project} from "@/domain/models";
import {createMathematicalDemonstration,technicalDataRows,tomSource} from "@/domain/client-demonstration";
import {calculateEstimate} from "@/domain/calculations/estimate";
import {resolvePhysicalStructure} from "@/domain/physical-structure";
import {technicalDataLabels,type TechnicalDataKey} from "@/domain/demonstration-schema";
import {serializeBackup} from "@/infrastructure/persistence/local";
import {downloadText} from "@/lib/format";
import {downloadBlob} from "@/lib/exports/proposal";
import {createCommercialDemoPdf,createTechnicalDemoPdf,demoMoney} from "@/lib/exports/demonstration";
import {PhysicalLineView} from "@/components/planning/physical-line-view";
import {MixedAnalysisWorkspace} from "@/components/planning/mixed-analysis-workspace";
import {DemonstrationNotice} from "./demo-entry";
import {HistoricalDemonstration} from "./mathematical-comparison";
import {DemoLanding, DemoPresentationJourney} from "./demo-presentation";
import "./demo-presentation.css";

const tabs=["Visão geral","Modelo","Materiais","Orçamento","Engenharia"] as const;
type Tab=typeof tabs[number];
export function DemoWorkspace({projectId}:{projectId?:string}){
  const {data}=useData(),project=data.projects.find(p=>p.id===projectId&&p.workspace.demonstration);
  if(!project)return <DemoLanding projectId={projectId} saved={data.projects.filter(p=>!!p.workspace.demonstration)}/>;
  return <DemoProject key={project.id} project={project}/>;
}
function DemoProject({project}:{project:Project}){
  const {data,saveProject,flush,setInvalidDraft}=useData(),router=useRouter();
  const [tab,setTab]=useState<Tab>("Visão geral"),[engineOpened,setEngineOpened]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [selected,setSelected]=useState(""),[node,setNode]=useState("");
  const mathematical=project.workspace.demonstration!.kind==="mathematical-validation";
  const model=useMemo(()=>project.workspace.physicalStructure?resolvePhysicalStructure(project).model:null,[project]);
  const estimate=useMemo(()=>calculateEstimate(project),[project]);
  const rows=technicalDataRows(project),filled=rows.filter(r=>r.information.trim()).length;
  function update(patch:Partial<Project>){setError("");setMessage("");try{saveProject(projectSchema.parse({...project,...patch}));}catch(e){setError((e as Error).message);}}
  function saved(){if(!flush())throw Error("Não foi possível salvar. Confira o aviso de armazenamento antes de continuar.");}
  function save(){try{saved();setMessage("Demonstração salva neste navegador. Reabra pela área Projetos.");setError("");}catch(e){setError((e as Error).message);}}
  function openMath(){try{
    saved();const p=createMathematicalDemonstration(project.id);saveProject(p);saved();setInvalidDraft(false);router.push(`/demonstracao?projeto=${p.id}`);
  }catch(e){setError((e as Error).message);}}
  function exportBackup(){try{
    saved();const ids=new Set(project.estimate.materials.map(l=>l.materialId));
    downloadText(serializeBackup({...data,projects:[project],materials:data.materials.filter(m=>ids.has(m.id))}),`jpn-demonstracao-${project.id.slice(0,8)}.json`);
    setMessage("Backup desta cópia exportado. Restaure em Configurações → Importar backup JSON.");
  }catch(e){setError((e as Error).message);}}
  async function pdf(kind:"commercial"|"technical"){
    try{saved();const bytes=await(kind==="commercial"?createCommercialDemoPdf(project):createTechnicalDemoPdf(project));downloadBlob(new Blob([bytes],{type:"application/pdf"}),`jpn-tom-${kind==="commercial"?"comercial":"pendencias"}.pdf`);setMessage("Resumo PDF exportado.");}catch(e){setError((e as Error).message);}
  }
  function editTechnical(key:TechnicalDataKey,patch:{information?:string;source?:string}){
    const demonstration=project.workspace.demonstration!,old=demonstration.technicalData?.[key]??{information:"",source:""};
    update({workspace:{...project.workspace,demonstration:{...demonstration,technicalData:{...demonstration.technicalData,[key]:{...old,...patch}}}}});
  }
  function selectTab(next:Tab){setTab(next);if(next==="Engenharia"&&mathematical)setEngineOpened(true);}
  return <div className="demo-workspace" data-testid="client-demonstration">
    <Link href="/projetos" className="back-link">← Projetos e demonstrações salvas</Link>
    {mathematical&&project.workspace.demonstration?.parentProjectId&&data.projects.some(p=>p.id===project.workspace.demonstration?.parentProjectId)&&
      <Link className="demo-back-to-case" href={`/demonstracao?projeto=${project.workspace.demonstration.parentProjectId}`}><ArrowLeft size={16} aria-hidden="true"/>Voltar ao caso comercial Tom</Link>}
    <PageHeading eyebrow={mathematical?"VALIDAÇÃO DO MOTOR NUMÉRICO":"CASO COMERCIAL AUDITADO"} title={project.name} description={mathematical?"Dados sintéticos explícitos, execução Python e comparação analítica.":"Dados comerciais reais auditados; geometria e cálculo da cobertura real pendentes."}/>
    <DemonstrationNotice project={project}/>
    <DemoPresentationJourney mathematical={mathematical} currentTab={tab} onNavigate={selectTab}/>
    <nav className="demo-tabs" role="tablist" aria-label="Áreas da demonstração">{tabs.map((label,i)=><button key={label} type="button" role="tab" id={`demo-tab-${i}`} aria-controls={`demo-panel-${i}`} aria-selected={tab===label} tabIndex={tab===label?0:-1} onClick={()=>selectTab(label)} onKeyDown={e=>{const index=e.key==="ArrowRight"?(i+1)%tabs.length:e.key==="ArrowLeft"?(i+tabs.length-1)%tabs.length:e.key==="Home"?0:e.key==="End"?tabs.length-1:-1;if(index<0)return;e.preventDefault();selectTab(tabs[index]);document.getElementById(`demo-tab-${index}`)?.focus();}}>{label}</button>)}</nav>
    <section className="panel demo-panel" role="tabpanel" id={`demo-panel-${tabs.indexOf(tab)}`} aria-labelledby={`demo-tab-${tabs.indexOf(tab)}`}>
      {tab==="Visão geral"&&<>
        <div className="demo-stats"><div><span>{mathematical?"Finalidade":"Orçamento comercial atual"}</span><strong data-testid="demo-budget-total">{mathematical?"Validação matemática":demoMoney(estimate.saleCents)}</strong></div><div><span>Geometria da cobertura real</span><strong>Pendente</strong></div><div><span>Liberação estrutural / fabricação</span><strong>Bloqueada</strong></div></div>
        {!mathematical?<><div className="demo-fact-strip" aria-label="Quantidades comerciais confirmadas">
          <div><strong>{tomSource.roofing_sheet.total_pieces}</strong><span>telhas</span></div>
          <div><strong>{tomSource.roofing_sheet.total_linear_m.toLocaleString("pt-BR")} m</strong><span>lineares de telha</span></div>
          <div><strong>6 + 20</strong><span>perfis U + U enrijecido</span></div>
        </div><h2>Cobertura Tom: o que está confirmado</h2><p>31 telhas, 107,65 m lineares de telha, seis peças comerciais U e vinte peças U enrijecido. Essas quantidades comerciais não determinam a quantidade ou posição real de tesouras e pilares.</p>
          <p>Dimensões de referência no desenho: limites de {tomSource.geometric_reference.upper_bound_length_m.toLocaleString("pt-BR")} m e {tomSource.geometric_reference.upper_bound_width_m.toLocaleString("pt-BR")} m. Área líquida e coordenadas reais não verificadas.</p>
          <p>Fonte: transcrição auditada do PR #52, preservada na M35. Referência comercial: <strong>R$ 9.651,29</strong>. Nenhum PDF privado é publicado.</p>
          <button type="button" className="button secondary" onClick={openMath}>Abrir demonstração estrutural separada</button>
        </>:<><h2>Modelo matemático independente</h2><p>Três barras: dois trechos de pórtico e um ramo axial, apoios e carga uniforme declarados na fixture validada M35.</p><button type="button" className="button" onClick={()=>selectTab("Engenharia")}>Abrir cálculo e referências</button></>}
        <details className="technical-details"><summary>Identificação da cópia editável</summary><Field label="Nome da demonstração"><Input value={project.name} maxLength={200} onChange={e=>update({name:e.target.value})}/></Field><Field label="Cliente da demonstração"><Input value={project.client} maxLength={200} onChange={e=>update({client:e.target.value})}/></Field></details>
      </>}
      {tab==="Modelo"&&<>{mathematical&&model?<><h2>Modelo de linhas — coordenadas declaradas</h2><PhysicalLineView model={model} selected={selected} onSelect={setSelected} selectedNodeId={node} onSelectNode={setNode}/><ReadOnlyPhysicalData project={project}/></>:<><h2>Geometria real pendente</h2><div className="demo-pending-geometry" data-testid="tom-geometry-pending"><strong>Coordenadas e topologia ainda não verificadas</strong><p>Os limites do desenho não definem o contorno líquido. Nenhuma tesoura, pilar, apoio, seção de aço ou carga foi criada para a cobertura do Tom.</p></div><button type="button" className="button secondary" onClick={()=>selectTab("Engenharia")}>Ver dados necessários para calcular a cobertura real</button></>}</>}
      {tab==="Materiais"&&<><h2>{mathematical?"Propriedades sintéticas declaradas":"Materiais e quantidades comerciais"}</h2>{mathematical?<ReadOnlyPhysicalData project={project}/>:<><p>Quantidades da planilha auditada, sem dedução de comprimentos de fabricação. Preços em centavos conservados no orçamento.</p><MaterialTable project={project}/></>}</>}
      {tab==="Orçamento"&&<>{mathematical?<><h2>Modelo de validação sem orçamento da obra</h2><p>Esta demonstração matemática não substitui nem altera o orçamento do Tom.</p></>:<><h2>Resumo comercial</h2><MaterialTable project={project}/><div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Despesas da planilha</th><th>Quantidade</th><th>Subtotal</th></tr></thead><tbody>{project.estimate.expenses.map(l=><tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td>{demoMoney(l.quantity!==null&&l.unitPriceCents!==null?Math.round(l.quantity*l.unitPriceCents):null)}</td></tr>)}</tbody></table></div><p className="demo-total" data-testid="demo-commercial-total">Total do orçamento: <strong>{demoMoney(estimate.saleCents)}</strong></p>
        {estimate.pending.length>0&&<ul role="alert">{estimate.pending.map(p=><li key={p}>{p}</li>)}</ul>}{estimate.saleCents!==965129&&<p className="notice">Valores desta cópia foram alterados. A referência auditada original é R$ 9.651,29.</p>}
        <div className="actions"><button type="button" className="button" onClick={()=>void pdf("commercial")}>Exportar resumo comercial PDF</button><Link className="button secondary" href={`/projetos/${project.id}?etapa=2`}>Editar orçamento desta cópia</Link></div></>}</>}
      {tab==="Engenharia"&&!mathematical&&<><h2>Dados necessários para calcular a cobertura real</h2>
        <div className="demo-technical-progress"><p><strong>{filled} de {rows.length} assuntos anotados.</strong> Essas anotações ajudam na conversa, mas não alimentam o motor estrutural nem substituem a conferência técnica.</p><progress max={rows.length} value={filled} aria-label="Assuntos com informações registradas"/></div>
        {rows.map(row=><details key={row.key} className="technical-details"><summary>{technicalDataLabels[row.key]} · {row.status}</summary><Field label={`${row.label} · informação disponível`}><Textarea maxLength={2000} value={row.information} onChange={e=>editTechnical(row.key,{information:e.target.value})}/></Field><Field label={`${row.label} · fonte ou confirmação necessária`}><Input maxLength={1000} value={row.source} onChange={e=>editTechnical(row.key,{source:e.target.value})}/></Field><p>Confirmar com o responsável técnico antes de usar em análise.</p></details>)}
        <div className="actions"><button type="button" className="button secondary" onClick={()=>void pdf("technical")}>Exportar pendências técnicas PDF</button><button type="button" className="button" onClick={openMath}>Abrir demonstração estrutural separada</button></div></>}
      {tab==="Engenharia"&&mathematical&&<><h2>Execução real e referências independentes</h2><p>Dados físicos desta fixture estão declarados. A análise usa o serviço Python existente, quando disponível. Aprovação normativa e fabricação permanecem bloqueadas.</p><ReadOnlyPhysicalData project={project}/><p><Link href={`/projetos/${project.id}?fluxo=levantamento&etapa=2`}>Conferir ou editar os dados físicos no cadastro completo</Link></p></>}
      {mathematical&&engineOpened&&<div className="demo-engine" hidden={tab!=="Engenharia"}><MixedAnalysisWorkspace project={project} onChange={update} demoPresentation/><HistoricalDemonstration/></div>}
    </section>
    <div className="demo-footer-controls">
    <div className="actions demo-actions"><button type="button" className="button" onClick={save}>Salvar demonstração</button><button type="button" className="button secondary" onClick={exportBackup}>Exportar backup desta cópia</button><Link className="button secondary" href="/configuracoes">Restaurar backup</Link></div>
    <p className="demo-toolbar-note"><HardDrive size={15} aria-hidden="true"/> As alterações ficam somente neste navegador. Exporte um backup para usar em outro computador.</p>
    {message&&<p role="status" className="success-message">{message}</p>}{error&&<p role="alert" className="field-error">{error}</p>}
    </div>
    <p className="field-hint">Salvo apenas neste navegador. Use o backup para trocar de computador. Demonstração experimental; liberação estrutural e fabricação bloqueadas.</p>
  </div>;
}
function MaterialTable({project}:{project:Project}){
  const r=calculateEstimate(project);
  return <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>{project.estimate.materials.map((l,i)=><tr key={l.id}><td>{l.name}</td><td>{r.materials[i].baseQuantity??"Pendente"}</td><td>{l.measurementUnit}</td><td>{demoMoney(l.unitPriceCents)}</td><td>{demoMoney(r.materials[i].subtotalCents)}</td></tr>)}</tbody></table></div>;
}
function ReadOnlyPhysicalData({project}:{project:Project}){
  const d=project.workspace.spatialPreparation!;
  return <details className="technical-details"><summary>Apoios, carregamentos e propriedades declaradas da fixture</summary>
    <h3>Apoios e restrições</h3><p>Eixos X/Y/Z e rotações RX/RY/RZ; fixed = restrito em zero, free = livre.</p><ul>{d.supports.map(s=><li key={s.nodeId}>{s.nodeId}: {s.dofs.join(" · ")}</li>)}</ul>
    <h3>Carregamento uniforme</h3><ul>{d.loading?.uniform.map(l=><li key={l.id}>{l.pieceId} · caso {l.caseId} · {l.coordinates} · ({l.knM.join("; ")}) kN/m · {l.source}</li>)}</ul>
    <h3>Materiais e seções sintéticos</h3><ul>{d.physicalCatalog?.materials.map(m=><li key={m.id}>{m.id}: E={m.eGpa} GPa · G={m.gGpa} GPa · ν={m.nu} · {m.materialSource}</li>)}{d.physicalCatalog?.sections.map(s=><li key={s.id}>{s.id}: A={s.areaCm2} cm² · Iy={s.iyCm4} cm⁴ · Iz={s.izCm4} cm⁴ · J={s.jCm4} cm⁴</li>)}</ul>
  </details>;
}
