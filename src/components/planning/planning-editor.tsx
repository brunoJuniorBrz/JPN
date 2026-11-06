"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Box, Save } from "lucide-react";
import { newProject, projectSchema, type Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { PhysicalModelImport } from "./physical-model-import";
import { DeclaredStructureEditor } from "./declared-structure-editor";
import { RoofOutlinePanel } from "./roof-outline-panel";
import { GuidedRoofSetup } from "./guided-roof-setup";
import { applyTomCommercial } from "@/domain/tom-commercial";
import { SpatialPreparationPanel } from "./spatial-preparation-panel";
import { transferTakeoff } from "@/domain/calculations/project-basis";
import { useData } from "@/components/data-provider";
import { PageHeading } from "@/components/ui";
import { GeneralForm } from "@/components/projects/general-form";
import { RoofForm } from "@/components/geometry/roof-form";
import { StructureForm } from "./structure-form";
import { TakeoffSummary, type ResultSection } from "./takeoff-summary";
import { ProjectWorkbench } from "./project-workbench";
import type { PieceRole } from "@/domain/structure";

const steps = ["Obra", "Medidas", "Estrutura", "Resultado"];
export function PlanningEditor({ initial, initialStep = 0, initialOpen3D = false }: { initial?: Project; initialStep?: number; initialOpen3D?: boolean }) {
  const { data, saveProject, flush, saveState, setInvalidDraft } = useData(); const router = useRouter();
  const [project, setProject] = useState(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState(initialStep), [submitted, setSubmitted] = useState(false), [message, setMessage] = useState("");
  const [profileToEdit, setProfileToEdit] = useState<PieceRole>();
  const [open3D, setOpen3D] = useState(initialOpen3D);
  const [resultSection, setResultSection] = useState<ResultSection>("model");
  const [open3DRequest, setOpen3DRequest] = useState(0);
  const declared=project.workspace.physicalStructure!==undefined;
  const preview = useMemo(() => declared?{model:resolvePhysicalStructure(project).model,pending:[]}:generateStructure(project), [project,declared]);
  const workflowSteps=declared?["Obra","Modelo declarado","Preparação física","Resultado"]:steps;
  const parsed = projectSchema.safeParse(project);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]));
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  useEffect(() => {
    if (step !== 3 || !open3D) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("jpn-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [step, open3D]);
  useEffect(() => {
    if (step !== 2 || !profileToEdit) return;
    const frame = window.requestAnimationFrame(() =>
      document.querySelector(`[data-profile-role="${profileToEdit}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [step, profileToEdit]);
  function update(patch: Partial<Project>) {
    let next = { ...project, ...patch };
    // Recalculate geometrically linked budget rows without changing manually
    // entered items or the user's loss percentages. Unfinished drafts retain
    // their old rows and the estimate reports them as stale.
    if (!next.workspace.physicalStructure && (patch.roof || patch.planning) && project.estimate.materials.some(line => line.source === "takeoff")
        && generateStructure(next).model) {
      try {
        const refreshed = transferTakeoff(next, 0);
        next = { ...refreshed, estimate: { ...refreshed.estimate,
          materials: refreshed.estimate.materials.map(line => {
            if (line.source !== "takeoff") return line;
            const old = project.estimate.materials.find(previous => previous.source === "takeoff" && previous.quantityOrigin?.role === line.quantityOrigin?.role);
            return { ...line, wastePercent: old?.wastePercent ?? 0 };
          }),
        } };
      } catch { /* Keep linked items pending if the model cannot be recalculated. */ }
    }
    setProject(next); setMessage("");
    const result = projectSchema.safeParse(next); setInvalidDraft(!initial || !result.success);
    if (initial && result.success) saveProject(result.data);
  }
  function go(target: number, request3D = false) {
    if (request3D) setResultSection("model");
    setSubmitted(true); if (!parsed.success) { setStep(0); return; }
    if (!initial) { saveProject(parsed.data); if (flush()) { setInvalidDraft(false); router.replace(`/projetos/${project.id}?fluxo=levantamento&etapa=${target}${request3D ? "&vista=3d" : ""}`); } }
    else { setStep(target); setOpen3D(request3D); if (request3D) setOpen3DRequest(n => n + 1); setSubmitted(false); if (!request3D) window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function save() { if (!parsed.success) { setSubmitted(true); setStep(0); return; } saveProject(parsed.data); if (flush()) setMessage("Levantamento salvo neste navegador."); }
  function importModel(next:Project){
    saveProject(next);if(!flush())throw Error("Não foi possível salvar o modelo importado; confira o aviso de armazenamento.");
    setProject(next);setInvalidDraft(false);setStep(3);setResultSection("model");setOpen3D(true);
    if(!initial)router.replace(`/projetos/${next.id}?fluxo=levantamento&etapa=3&vista=3d`);
  }
  return <><Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link><PageHeading eyebrow="DA MEDIDA À LISTA DE MATERIAIS" title={project.name || "Vamos começar sua obra"} description="Informe a obra, configure a geometria e veja as peças e os quantitativos." />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Medidas, distribuição e perfis apenas para demonstrar o cálculo geométrico.</p>}
    {step !== 3 && project.technicalNotes.startsWith("PRÉ-PROJETO VISUAL:") && <p className="example-banner">PRÉ-PROJETO VISUAL · Perfis e espaçamentos são sugestões geométricas editáveis, sem dimensionamento. Não usar para comprar ou cortar.</p>}
    <PhysicalModelImport project={project} onImport={importModel}/>
    <details className="technical-details"><summary>Referência comercial auditada — Tom</summary><p>Reproduz R$ 9.651,29 com 31 telhas e 107,65 m lineares, seis peças U e vinte peças Ue. Não cria tesouras, pilares, contorno ou propriedades. Reprodução de custo com margem zero; use orçamento vazio.</p><button type="button" className="button secondary" onClick={()=>{try{const next=applyTomCommercial(project);update({estimate:next.estimate});setMessage("Orçamento comercial do Tom carregado; nenhuma estrutura real foi presumida.");}catch(e){setMessage((e as Error).message);}}}>Carregar orçamento auditado do Tom</button></details>
    <DeclaredStructureEditor key={project.id+JSON.stringify(project.workspace.physicalStructure)} project={project} onCommit={importModel}/>
    {declared&&<RoofOutlinePanel key={project.id+JSON.stringify(project.workspace.roofOutline)} project={project} onChange={update}/>}
    <section className="panel workflow-panel"><nav className="workflow-steps planning-steps" aria-label="Etapas do levantamento">{workflowSteps.map((label, i) => <button key={label} type="button" className={step === i ? "current" : ""} aria-current={step === i ? "step" : undefined} onClick={() => go(i)}><span>{i + 1}</span>{label}</button>)}</nav><p className="workflow-progress">Passo {step + 1} de 4 — {workflowSteps[step]}</p>
      <div className="viewer-shortcut"><button type="button" className="button secondary" onClick={() => {
        if (preview.model) { go(3, true); return; }
        setMessage(preview.pending[0] ?? "Complete as medidas e a estrutura para visualizar o modelo 3D.");
        const roof = project.roof;
        go(roof.widthM === null || roof.lengthM === null || roof.lowHeightM === null || roof.slopePercent === null ? 1 : 2);
      }}><Box size={19} />{preview.model ? "Abrir modelo 3D" : "Configurar modelo 3D"}</button><span className="field-hint">{preview.model ? "Visualização 3D da estrutura disponível também no celular." : `Para visualizar em 3D: ${preview.pending[0] ?? "complete a estrutura"}`}</span></div>
      <div className="workflow-content">
        {step === 0 && <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />}
        {step === 1 && !declared && <GuidedRoofSetup project={project} onChange={update}/>}
        {step === 1 && (declared?<p className="notice">Modelo declarado: {project.workspace.physicalStructure!.nodes.length} nós e {project.workspace.physicalStructure!.pieces.length} barras. Consulte as vistas no Resultado ou importe uma nova revisão JSON. Nenhuma cobertura foi gerada.</p>:["Cobertura metálica","Galpão","Barracão"].includes(project.category) ? <RoofForm typology={project.planning?.typology} roof={project.roof} onChange={roof => update({ roof })} planning partialOutline={project.workspace.guidedSupport?.coverage==="partial"} /> : <p className="notice">A geração de peças atende coberturas de uma água nesta versão. O orçamento de venda continua disponível para outras categorias.</p>)}
        {step === 2 && (declared?<SpatialPreparationPanel project={project} onChange={update} mixed/>:<StructureForm project={project} onChange={update} profileToEdit={profileToEdit} />)}
        {step === 3 && <><TakeoffSummary project={project} activeSection={resultSection} onSectionChange={setResultSection} onResolvePending={target => { setProfileToEdit(target.role); go(target.step); }} startIn3D={open3D} open3DRequest={open3DRequest} onEditStructure={() => { setProfileToEdit(undefined); go(2); }} onConfigureProfile={role => { setProfileToEdit(role); go(2); }} /><ProjectWorkbench project={project} activeSection={resultSection} onChange={update} onEditStructure={() => { setProfileToEdit(undefined); go(2); }} /></>}
      </div>
      <div className="workflow-footer"><span className="field-hint">Quantitativos independentes de preços</span><div className="actions">{step > 0 && <button type="button" className="button secondary" onClick={() => go(step - 1)}><ArrowLeft size={18} />Voltar</button>}{step < 3 ? <button type="button" className="button" onClick={() => go(step + 1)}>{!initial ? "Salvar e continuar" : `Ir para ${workflowSteps[step + 1].toLowerCase()}`}<ArrowRight size={18} /></button> : <button type="button" className="button" onClick={save}><Save size={18} />Salvar levantamento</button>}</div></div>
      <p className="editor-save-note" role="status">{message || (!initial ? "O projeto será criado ao continuar." : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Confira o aviso de armazenamento." : "Alterações salvas neste navegador.")}</p>
    </section></>;
}
