"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Box, Lock, Save } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { GeneralForm } from "@/components/projects/general-form";
import { RoofForm } from "@/components/geometry/roof-form";
import { StructureForm } from "./structure-form";
import { GeneratedFiles, GeneratedMaterials, GeneratedReview, GeneratedSafetyWarning, GeneratedTotals, GeneratedViewport, useGeneratedResult, type ResultSection } from "./takeoff-summary";
import { DeclaredEngineering, DeclaredFiles, DeclaredMaterials, DeclaredSafetyWarning, DeclaredViewport, useDeclaredModel } from "./declared-model-summary";
import { ProjectWorkbench, type WorkbenchTool } from "./project-workbench";
import { StudioLayout, StudioRail, studioStepFromLegacy, studioStepIndex, studioStepUrl, studioSteps, type AnalysisTool, type StudioStepId } from "./project-studio";
import type { PendingTarget } from "./result-presentation";
import { StudioAnalysisProvider } from "./studio-analysis";
import { StudioSelection } from "./studio-selection";
import { studioModelFromPhysical } from "@/domain/studio-result-layers";
import type { PieceRole } from "@/domain/structure";

const workbenchSection: Record<StudioStepId, ResultSection> = {
  obra: "model", geometria: "model", estrutura: "model", cargas: "engineering", analise: "engineering",
  verificacao: "model", materiais: "materials", arquivos: "files",
};

type EditorProps = { initial?: Project; initialStep?: number; initialStudioStep?: StudioStepId; initialOpen3D?: boolean };

/** O provedor da análise fica acima do estúdio: inspetor, 3D e status leem o mesmo estado. */
export function PlanningEditor(props: EditorProps) {
  return <StudioAnalysisProvider><StudioEditor {...props} /></StudioAnalysisProvider>;
}

function StudioEditor({ initial, initialStep = 0, initialStudioStep, initialOpen3D = false }: EditorProps) {
  const { data, saveProject, flush, saveState, setInvalidDraft } = useData(); const router = useRouter();
  const [selectedPiece, setSelectedPiece] = useState(""), [selectedNode, setSelectedNode] = useState("");
  const [project, setProject] = useState(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState<StudioStepId>(initialStudioStep ?? studioStepFromLegacy(initialStep));
  const [analysisTool, setAnalysisTool] = useState<AnalysisTool>("overview");
  const [submitted, setSubmitted] = useState(false), [message, setMessage] = useState("");
  const [profileToEdit, setProfileToEdit] = useState<PieceRole>();
  const [open3D, setOpen3D] = useState(initialOpen3D);
  const [open3DRequest, setOpen3DRequest] = useState(0);
  const declared = project.workspace.physicalStructure !== undefined;
  const generated = useGeneratedResult(project);
  const preview = useMemo(() => declared ? { model: resolvePhysicalStructure(project).model, pending: [] as string[] } : generateStructure(project), [project, declared]);
  const selectionModel = useMemo(() => {
    if (!declared) return generated.result.model ?? null;
    const physical = resolvePhysicalStructure(project).model;
    try { return physical ? studioModelFromPhysical(physical) : null; } catch { return null; }
  }, [declared, generated.result.model, project]);
  const parsed = projectSchema.safeParse(project);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]));
  const stepIndex = studioStepIndex(step), stepLabel = studioSteps[stepIndex].label;
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  useEffect(() => { document.querySelector(".studio-inspector")?.scrollTo({ top: 0 }); }, [step]);
  // F2: ao selecionar no 3D, o cartão da seleção (topo do inspetor) fica visível sem rolar.
  useEffect(() => { if (selectedPiece || selectedNode) document.querySelector(".studio-inspector")?.scrollTo({ top: 0, behavior: "smooth" }); }, [selectedPiece, selectedNode]);
  useEffect(() => {
    if (!open3D || open3DRequest === 0) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("jpn-viewer")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [open3D, open3DRequest]);
  useEffect(() => {
    if (step !== "estrutura" || !profileToEdit) return;
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
  /** Troca de etapa. Projeto novo: salva e passa a usar a URL do projeto criado. */
  function go(target: StudioStepId, request3D = false) {
    setSubmitted(true); if (!parsed.success) { setStep("obra"); return; }
    if (!initial) { saveProject(parsed.data); if (flush()) { setInvalidDraft(false); router.replace(`/projetos/${project.id}?fluxo=levantamento&etapa=${studioStepUrl(target)}${request3D ? "&vista=3d" : ""}`); } return; }
    setStep(target); setSubmitted(false);
    if (request3D) { setOpen3D(true); setOpen3DRequest(n => n + 1); setSelectedPiece(""); }
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openTool(tool: WorkbenchTool) {
    if (tool === "prepare") { go("cargas"); return; }
    setAnalysisTool(tool); if (step !== "analise") go("analise");
  }
  function resolvePending(target: PendingTarget) { setProfileToEdit(target.role); go(target.step === 1 ? "geometria" : "estrutura"); }
  /** Ao saltar do visualizador para a edição, a seleção é limpa (como quando o Resultado fechava). */
  function resetViewer() { setOpen3DRequest(n => n + 1); setSelectedPiece(""); }
  function editStructure() { setProfileToEdit(undefined); resetViewer(); go("estrutura"); }
  function configureProfile(role: PieceRole) { setProfileToEdit(role); resetViewer(); go("estrutura"); }
  function save() { if (!parsed.success) { setSubmitted(true); setStep("obra"); return; } saveProject(parsed.data); if (flush()) setMessage("Levantamento salvo neste navegador."); }
  function importModel(next: Project) {
    saveProject(next); if (!flush()) throw Error("Não foi possível salvar o modelo importado; confira o aviso de armazenamento.");
    setProject(next); setInvalidDraft(false); setStep("materiais"); setOpen3D(true); setOpen3DRequest(n => n + 1); setSelectedPiece(""); setSelectedNode("");
    if (!initial) router.replace(`/projetos/${next.id}?fluxo=levantamento&etapa=materiais&vista=3d`);
  }
  function open3DViewer() {
    if (preview.model) {
      if (!initial) { go(step, true); return; }
      // Reabrir o 3D recomeça a câmera e a seleção, como quando o visualizador era remontado.
      setOpen3D(true); setOpen3DRequest(n => n + 1); setSelectedPiece(""); return;
    }
    setMessage(preview.pending[0] ?? "Complete as medidas e a estrutura para visualizar o modelo 3D.");
    const roof = project.roof;
    go(roof.widthM === null || roof.lengthM === null || roof.lowHeightM === null || roof.slopePercent === null ? "geometria" : "estrutura");
  }

  const declaredModel = declared ? <DeclaredModelParts project={project} selected={selectedPiece} onSelect={setSelectedPiece} nodeId={selectedNode} onSelectNode={setSelectedNode} /> : null;
  const showSelection = !!selectedPiece || !!selectedNode || step === "analise" || step === "verificacao";
  const selection = showSelection ? <StudioSelection model={selectionModel} selected={selectedPiece} onSelect={setSelectedPiece} nodeId={selectedNode} onSelectNode={setSelectedNode} /> : null;
  const tool: WorkbenchTool = step === "cargas" ? "prepare" : analysisTool;
  const workbench = <ProjectWorkbench project={project} activeSection={declared && step === "cargas" ? "model" : workbenchSection[step]} tool={tool} onToolChange={openTool} onChange={update} onEditStructure={editStructure} />;

  let panel: ReactNode = null;
  if (step === "obra") panel = <>
    <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />
    <div className="studio-project-tools">
      <PhysicalModelImport project={project} onImport={importModel} />
      <details className="technical-details"><summary>Referência comercial auditada — Tom</summary><p>Reproduz R$ 9.651,29 com 31 telhas e 107,65 m lineares, seis peças U e vinte peças Ue. Não cria tesouras, pilares, contorno ou propriedades. Reprodução de custo com margem zero; use orçamento vazio.</p><button type="button" className="button secondary" onClick={() => { try { const next = applyTomCommercial(project); update({ estimate: next.estimate }); setMessage("Orçamento comercial do Tom carregado; nenhuma estrutura real foi presumida."); } catch (e) { setMessage((e as Error).message); } }}>Carregar orçamento auditado do Tom</button></details>
      <DeclaredStructureEditor key={project.id + JSON.stringify(project.workspace.physicalStructure)} project={project} onCommit={importModel} />
    </div>
  </>;
  else if (step === "geometria") panel = declared
    ? <><p className="notice">Modelo declarado: {project.workspace.physicalStructure!.nodes.length} nós e {project.workspace.physicalStructure!.pieces.length} barras. Consulte as vistas no centro ou importe uma nova revisão JSON na etapa Obra. Nenhuma cobertura foi gerada.</p><RoofOutlinePanel key={project.id + JSON.stringify(project.workspace.roofOutline)} project={project} onChange={update} /></>
    : <><GuidedRoofSetup project={project} onChange={update} />{["Cobertura metálica", "Galpão", "Barracão"].includes(project.category) ? <RoofForm typology={project.planning?.typology} roof={project.roof} onChange={roof => update({ roof })} planning partialOutline={project.workspace.guidedSupport?.coverage === "partial"} /> : <p className="notice">A geração de peças atende coberturas de uma água nesta versão. O orçamento de venda continua disponível para outras categorias.</p>}</>;
  else if (step === "estrutura") panel = declared ? <SpatialPreparationPanel project={project} onChange={update} mixed /> : <StructureForm project={project} onChange={update} profileToEdit={profileToEdit} />;
  else if (step === "cargas" && declared) panel = <div className="notice"><p>No modelo declarado, apoios, cargas e combinações ficam na preparação física da etapa Estrutura.</p><button type="button" className="button secondary" onClick={() => go("estrutura")}>Abrir preparação física</button></div>;
  else if (step === "analise" && declared) panel = <DeclaredEngineering />;
  else if (step === "verificacao") panel = declared
    ? <div className="notice"><p>Os relatórios de resistência, apoios e ligações ficam nos resultados da análise estrutural. Verificações normativas incompletas · fabricação bloqueada.</p><button type="button" className="button secondary" onClick={() => go("analise")}>Abrir análise estrutural</button></div>
    : <><GeneratedReview result={generated.result} pending={generated.pending} onResolvePending={resolvePending} /><div className="spatial-jump"><p>Resistência, apoios e ligações aparecem nos resultados da Análise Estrutural Experimental.</p><button type="button" className="button secondary" onClick={() => openTool("mixedlocal")}>Abrir análise estrutural</button></div></>;
  else if (step === "materiais") panel = declared ? <DeclaredMaterialsPart project={project} /> : <GeneratedMaterials result={generated.result} grouped={generated.grouped} />;
  else if (step === "arquivos") panel = declared ? <DeclaredFiles project={project} /> : <GeneratedFiles project={project} hasModel={!!generated.result.model} />;

  const next = studioSteps[stepIndex + 1];
  const pendingCount = declared ? undefined : generated.result.pending.length;
  return <>
    <Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link>
    <PageHeading eyebrow="DA MEDIDA À LISTA DE MATERIAIS" title={project.name || "Vamos começar sua obra"} description="Informe a obra, configure a geometria e veja as peças e os quantitativos." />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Medidas, distribuição e perfis apenas para demonstrar o cálculo geométrico.</p>}
    {step !== "materiais" && project.technicalNotes.startsWith("PRÉ-PROJETO VISUAL:") && <p className="example-banner">PRÉ-PROJETO VISUAL · Perfis e espaçamentos são sugestões geométricas editáveis, sem dimensionamento. Não usar para comprar ou cortar.</p>}
    <StudioLayout
      rail={<StudioRail step={step} onStep={id => go(id)} tool={analysisTool} onTool={openTool} showTools={!declared} pendingCount={pendingCount} />}
      viewportToolbar={<div className="viewer-shortcut"><button type="button" className="button secondary" onClick={open3DViewer}><Box size={19} />{preview.model ? "Abrir modelo 3D" : "Configurar modelo 3D"}</button><span className="field-hint">{preview.model ? "Visualização 3D da estrutura disponível também no celular." : `Para visualizar em 3D: ${preview.pending[0] ?? "complete a estrutura"}`}</span></div>}
      viewport={declared ? declaredModel : <GeneratedViewport project={project} result={generated.result} startIn3D={open3D} open3DRequest={open3DRequest} onConfigureProfile={configureProfile} onEditStructure={editStructure} onResolvePending={resolvePending} selected={selectedPiece} onSelect={setSelectedPiece} />}
      inspectorTitle={step === "analise" && !declared ? `Análise · ${analysisToolLabel(analysisTool)}` : stepLabel}
      inspector={<>
        <p className="workflow-progress">Passo {stepIndex + 1} de {studioSteps.length} — {stepLabel}</p>
        <div className="workflow-content">{selection}{panel}{workbench}</div>
        <div className="workflow-footer"><span className="field-hint">Quantitativos independentes de preços</span><div className="actions">
          {stepIndex > 0 && <button type="button" className="button secondary" onClick={() => go(studioSteps[stepIndex - 1].id)}><ArrowLeft size={18} />Voltar</button>}
          {initial && <button type="button" className={next ? "button secondary" : "button"} onClick={save}><Save size={18} />Salvar levantamento</button>}
          {next && <button type="button" className="button" onClick={() => go(next.id)}>{!initial ? "Salvar e continuar" : `Ir para ${next.label.toLowerCase()}`}<ArrowRight size={18} /></button>}
        </div></div>
        <p className="editor-save-note" role="status">{message || (!initial ? "O projeto será criado ao continuar." : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Confira o aviso de armazenamento." : "Alterações salvas neste navegador.")}</p>
      </>}
      status={<>
        <Badge tone="danger" icon={<Lock />} className="studio-lock">Bloqueado para fabricação</Badge>
        {declared ? <DeclaredSafetyWarning /> : <GeneratedSafetyWarning />}
        {!declared && <GeneratedTotals result={generated.result} />}
      </>}
    />
  </>;
}

function analysisToolLabel(tool: AnalysisTool) {
  return { overview: "Roteiro estrutural", analysis: "Análise disponível", spatial: "Análise 3D experimental", mixedlocal: "Análise Estrutural Experimental" }[tool];
}

function DeclaredModelParts({ project, selected, onSelect, nodeId, onSelectNode }: { project: Project; selected: string; onSelect: (id: string) => void; nodeId: string; onSelectNode: (id: string) => void }) {
  const declared = useDeclaredModel(project);
  return <DeclaredViewport project={project} declared={declared} selected={selected} onSelect={onSelect} nodeId={nodeId} onSelectNode={onSelectNode} />;
}
function DeclaredMaterialsPart({ project }: { project: Project }) {
  const declared = useDeclaredModel(project);
  return <DeclaredMaterials declared={declared} />;
}
