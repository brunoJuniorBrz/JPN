"use client";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { TrussEditor } from "@/components/truss/truss-editor";
import { applyTrussToProject, trussDefaultsFor } from "@/domain/truss-editor";
import { CompletePackageControl } from "./complete-package-control";
import { GeneratedFiles, GeneratedMaterials, GeneratedReview, GeneratedSafetyWarning, GeneratedTotals, GeneratedViewport, useGeneratedResult, type ResultSection } from "./takeoff-summary";
import { DeclaredEngineering, DeclaredFiles, DeclaredMaterials, DeclaredSafetyWarning, DeclaredViewport, useDeclaredModel } from "./declared-model-summary";
import { ProjectWorkbench, type WorkbenchTool } from "./project-workbench";
import { StudioLayout, StudioRail, StudioTools, studioStepFromLegacy, studioStepIndex, studioStepUrl, studioSteps, type AnalysisTool, type StudioStepId } from "./project-studio";
import type { PendingTarget } from "./result-presentation";
import { StudioAnalysisProvider, useStudioAnalysis } from "./studio-analysis";
import { StudioCommandPalette, StudioViewportMenu } from "./studio-command";
import { AdvancedToolsMenu, StudioTour } from "./studio-advanced";
import type { Viewer3DApi } from "./structure-3d";
import { StudioSelection } from "./studio-selection";
import { studioModelFromPhysical } from "@/domain/studio-result-layers";
import { StudioResultsBar, useStudioResultView } from "./studio-results";
import { AnalysisState, FabricationSeal, LiveTotals, liveTotals } from "./studio-status";
import { InfoTip } from "@/components/ui/info-tip";
import { mixedPreparationReview } from "@/domain/mixed-adapter";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import type { PieceRole } from "@/domain/structure";

const workbenchSection: Record<StudioStepId, ResultSection> = {
  obra: "model", geometria: "model", estrutura: "model", tesoura: "model", cargas: "engineering", analise: "engineering",
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
  const [hoveredPiece, setHoveredPiece] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [viewerApi, setViewerApi] = useState<Viewer3DApi | null>(null);
  const { analysis: studioAnalysis, commands: analysisCommands } = useStudioAnalysis();
  const [project, setProject] = useState(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState<StudioStepId>(initialStudioStep ?? (initial?.workspace.trussEditor && initialStep === 3 ? "tesoura" : studioStepFromLegacy(initialStep)));
  const [analysisTool, setAnalysisTool] = useState<AnalysisTool>("overview");
  const [submitted, setSubmitted] = useState(false), [message, setMessage] = useState("");
  const [profileToEdit, setProfileToEdit] = useState<PieceRole>();
  // Modelos já existentes abrem diretamente no 3D, com opção de voltar às vistas simples.
  const [open3D, setOpen3D] = useState(initialOpen3D || !!initial);
  const [open3DRequest, setOpen3DRequest] = useState(0);
  const declared = project.workspace.physicalStructure !== undefined;
  const generated = useGeneratedResult(project);
  // F4: a visualização (2D/3D, seleção, camadas) usa a versão adiada do projeto; totais, selo e
  // formulários usam a imediata. Assim os totais mudam no primeiro commit após a edição.
  const deferredProject = useDeferredValue(project);
  const viewGenerated = useGeneratedResult(deferredProject);
  const preview = useMemo(() => declared ? { model: resolvePhysicalStructure(project).model, pending: [] as string[] } : generated.result, [project, declared, generated.result]);
  const selectionModel = useMemo(() => {
    if (!declared) return viewGenerated.result.model ?? null;
    const physical = resolvePhysicalStructure(deferredProject).model;
    try { return physical ? studioModelFromPhysical(physical) : null; } catch { return null; }
  }, [declared, viewGenerated.result.model, deferredProject]);
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
    // Modelo declarado segue para Geometria (contorno da cobertura e aviso do modelo); gerado, para Materiais.
    const target: StudioStepId = next.workspace.physicalStructure ? "geometria" : "materiais";
    setInvalidDraft(false);
    // Projeto novo: o modelo já está salvo; vai direto para a URL do projeto criado. Renderizar o
    // modelo 3D declarado nesta página (que será descartada) atrasava a navegação em vários segundos.
    if (!initial) { router.replace(`/projetos/${next.id}?fluxo=levantamento&etapa=${target}&vista=3d`); return; }
    setProject(next); setStep(target); setOpen3D(true); setOpen3DRequest(n => n + 1); setSelectedPiece(""); setSelectedNode("");
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

  const resultView = useStudioResultView(selectionModel, selectedPiece, selectedNode, showLabels);
  const declaredModel = declared ? <DeclaredModelParts project={project} selected={selectedPiece} onSelect={setSelectedPiece} nodeId={selectedNode} onSelectNode={setSelectedNode} analysisColors={resultView.colors} deformed={resultView.deformed} labels={resultView.labels} onApi={setViewerApi} onHover={setHoveredPiece} /> : null;
  // F4: totais e pendências derivados do projeto em memória (atualizam no mesmo render da edição).
  const totals = useMemo(() => liveTotals(project, declared ? null : generated.result), [project, declared, generated.result]);
  const declaredIssues = useMemo(() => {
    if (!declared) return [] as string[];
    try { const draft = project.workspace.spatialPreparation ?? newSpatialPreparation(project); return mixedPreparationReview(project, draft, !!draft.loading).issues.map(i => i.message); }
    catch { return [] as string[]; }
  }, [declared, project]);
  const showSelection = !!selectedPiece || !!selectedNode || !!hoveredPiece || step === "analise" || step === "verificacao";
  const selection = showSelection ? <StudioSelection model={selectionModel} selected={selectedPiece} hovered={hoveredPiece} onSelect={setSelectedPiece} nodeId={selectedNode} onSelectNode={setSelectedNode} /> : null;
  const tool: WorkbenchTool = step === "cargas" ? "prepare" : analysisTool;
  const workbench = <ProjectWorkbench project={project} activeSection={declared && step === "cargas" ? "model" : workbenchSection[step]} tool={tool} onToolChange={openTool} onChange={update} onEditStructure={editStructure} />;

  let panel: ReactNode = null;
  // Ferramentas do projeto (importar, Tom, estrutura irregular, contorno): recolhidas ao pé do inspetor em
  // TODAS as etapas, como ficavam sempre visíveis na tela antiga. O menu "Ferramentas avançadas" leva até elas.
  const projectTools = <section className="studio-project-tools" aria-label="Ferramentas do projeto">
    <PhysicalModelImport project={project} onImport={importModel} />
    <details className="technical-details"><summary>Referência comercial auditada — Tom</summary><p>Reproduz R$ 9.651,29 com 31 telhas e 107,65 m lineares, seis peças U e vinte peças Ue. Não cria tesouras, pilares, contorno ou propriedades. Reprodução de custo com margem zero; use orçamento vazio.</p><button type="button" className="button secondary" onClick={() => { try { const next = applyTomCommercial(project); update({ estimate: next.estimate }); setMessage("Orçamento comercial do Tom carregado; nenhuma estrutura real foi presumida."); } catch (e) { setMessage((e as Error).message); } }}>Carregar orçamento auditado do Tom</button></details>
    <DeclaredStructureEditor key={project.id + JSON.stringify(project.workspace.physicalStructure)} project={project} onCommit={importModel} />
    {declared && <RoofOutlinePanel key={project.id + JSON.stringify(project.workspace.roofOutline)} project={project} onChange={update} />}
  </section>;
  if (step === "obra") panel = <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />;
  else if (step === "geometria") panel = declared
    ? <p className="notice">Modelo declarado: {project.workspace.physicalStructure!.nodes.length} nós e {project.workspace.physicalStructure!.pieces.length} barras. Consulte as vistas no centro; o contorno da cobertura, a edição por nós e barras e a importação de nova revisão JSON ficam em Ferramentas do projeto, abaixo. Nenhuma cobertura foi gerada.</p>
    : <><GuidedRoofSetup project={project} onChange={update} />{["Cobertura metálica", "Galpão", "Barracão"].includes(project.category) ? <RoofForm typology={project.planning?.typology} roof={project.roof} onChange={roof => update({ roof })} planning partialOutline={project.workspace.guidedSupport?.coverage === "partial"} /> : <p className="notice">A geração de peças atende coberturas de uma água nesta versão. O orçamento de venda continua disponível para outras categorias.</p>}</>;
  else if (step === "estrutura") panel = declared ? <SpatialPreparationPanel project={project} onChange={update} mixed /> : <StructureForm project={project} onChange={update} profileToEdit={profileToEdit} />;
  else if (step === "tesoura") panel = <TrussEditor key={project.id} initial={project.workspace.trussEditor ?? trussDefaultsFor(project)} applyLabel="Aplicar na obra e atualizar o 3D" onApply={t => {
    const next = applyTrussToProject(project, t);
    update({ roof: next.roof, planning: next.planning, workspace: next.workspace, technicalNotes: next.technicalNotes, updatedAt: next.updatedAt });
    setSelectedPiece(""); setSelectedNode(""); setHoveredPiece("");
    setMessage("Tesoura atualizada no mesmo modelo físico do 3D, CAD e quantitativos. Fabricação continua bloqueada.");
  }} />;
  else if (step === "cargas" && declared) panel = <div className="notice"><p>No modelo declarado, apoios, cargas e combinações ficam na preparação física da etapa Estrutura.</p><button type="button" className="button secondary" onClick={() => go("estrutura")}>Abrir preparação física</button></div>;
  else if (step === "analise" && declared) panel = <DeclaredEngineering />;
  else if (step === "verificacao") panel = declared
    ? <div className="notice"><p>Os relatórios de resistência, apoios e ligações ficam nos resultados da análise estrutural. Verificações normativas incompletas · fabricação bloqueada.</p><button type="button" className="button secondary" onClick={() => go("analise")}>Abrir análise estrutural</button></div>
    : <><GeneratedReview result={generated.result} pending={generated.pending} onResolvePending={resolvePending} /><div className="spatial-jump"><p>Resistência, apoios e ligações aparecem nos resultados da Análise Estrutural Experimental.</p><button type="button" className="button secondary" onClick={() => openTool("mixedlocal")}>Abrir análise estrutural</button></div></>;
  else if (step === "materiais") panel = declared ? <DeclaredMaterialsPart project={project} /> : <GeneratedMaterials result={generated.result} grouped={generated.grouped} onShowPieces={ids => { setSelectedPiece(ids[0] ?? ""); setSelectedNode(""); if (ids[0]) window.requestAnimationFrame(() => viewerApi?.focus(ids[0])); }} />;
  else if (step === "arquivos") panel = declared ? <>
    <DeclaredFiles project={project} />
    <CompletePackageControl project={project} onChange={update} beforeExport={() => {
      saveProject(project);
      if (!flush()) throw Error("Não foi possível salvar esta revisão antes da exportação.");
    }} />
  </> : <>
    <GeneratedFiles project={project} hasModel={!!generated.result.model} />
    {/* O pacote CAD usa tanto a geometria gerada quanto a física declarada.
        Preservar a exportação para a obra criada pelo formulário. */}
    <CompletePackageControl project={project} onChange={update} beforeExport={() => {
      saveProject(project);
      if (!flush()) throw Error("Não foi possível salvar esta revisão antes da exportação.");
    }} />
  </>;

  const next = studioSteps[stepIndex + 1];
  const pendingCount = declared ? undefined : generated.result.pending.length;
  return <>
    <Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link>
    <PageHeading eyebrow="DA MEDIDA À LISTA DE MATERIAIS" title={project.name || "Vamos começar sua obra"} description="Informe a obra, configure a geometria e veja as peças e os quantitativos."
      action={<div className="studio-header-actions">
        <StudioTour />
        <AdvancedToolsMenu goStep={id => go(id)} openTool={openTool} />
        <StudioCommandPalette model={selectionModel} actions={{
          goStep: id => go(id), openTool, open3D: open3DViewer, save, selectPiece: setSelectedPiece, showAll: () => viewerApi?.showAll(),
          recalculate: () => { if (studioAnalysis.ready) analysisCommands.run(); else openTool("mixedlocal"); },
        }} />
      </div>} />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Medidas, distribuição e perfis apenas para demonstrar o cálculo geométrico.</p>}
    {step !== "materiais" && project.technicalNotes.startsWith("PRÉ-PROJETO VISUAL:") && <p className="example-banner">PRÉ-PROJETO VISUAL · Perfis e espaçamentos são sugestões geométricas editáveis, sem dimensionamento. Não usar para comprar ou cortar.</p>}
    <StudioLayout
      rail={<StudioRail step={step} onStep={id => go(id)} pendingCount={pendingCount} />}
      openKey={`${step}|${selectedPiece}|${selectedNode}`}
      viewportToolbar={<><div className="viewer-shortcut"><button type="button" className="button secondary" onClick={open3DViewer}><Box size={19} />{preview.model ? "Abrir modelo 3D" : "Configurar modelo 3D"}</button>{preview.model
          ? <InfoTip label="visualização 3D">Visualização 3D da estrutura disponível também no celular. Arraste para girar; use Iso/Superior/Frontal/Lateral para vistas prontas.</InfoTip>
          : <span className="field-hint">{`Para visualizar em 3D: ${preview.pending[0] ?? "complete a estrutura"}`}</span>}</div>
        {preview.model && <StudioResultsBar onSelectNode={setSelectedNode} onOpenAnalysis={() => openTool("mixedlocal")} showLabels={showLabels} onShowLabels={setShowLabels} />}</>}
      viewport={<StudioViewportMenu model={selectionModel} selected={selectedPiece} api={viewerApi} onShowForces={id => { setSelectedPiece(id); if (step !== "analise" && step !== "verificacao") go("verificacao"); }} onEditProfile={declared ? () => go(project.workspace.trussEditor ? "tesoura" : "estrutura") : configureProfile}>
        {declared ? declaredModel : <GeneratedViewport project={deferredProject} result={viewGenerated.result} startIn3D={open3D} open3DRequest={open3DRequest} onConfigureProfile={configureProfile} onEditStructure={editStructure} onResolvePending={resolvePending} selected={selectedPiece} onSelect={setSelectedPiece}
          analysisColors={resultView.colors} deformed={resultView.deformed} orientationCube labels={resultView.labels} onApi={setViewerApi} onHover={setHoveredPiece} />}
      </StudioViewportMenu>}
      inspectorTitle={step === "analise" && !declared ? `Análise · ${analysisToolLabel(analysisTool)}` : stepLabel}
      inspector={<>
        <p className="workflow-progress">Passo {stepIndex + 1} de {studioSteps.length} — {stepLabel}</p>
        <div className="workflow-content">{!declared && step === "analise" && <StudioTools step={step} tool={analysisTool} onTool={openTool} />}{selection}{panel}{workbench}{projectTools}</div>
        <div className="workflow-footer"><InfoTip label="quantitativos">Quantitativos independentes de preços: comprimentos e peças vêm da geometria; preços entram só no Orçamento de venda.</InfoTip><div className="actions">
          {stepIndex > 0 && <button type="button" className="button secondary" onClick={() => go(studioSteps[stepIndex - 1].id)}><ArrowLeft size={18} />Voltar</button>}
          {initial && <button type="button" className={next ? "button secondary" : "button"} onClick={save}><Save size={18} />Salvar levantamento</button>}
          {next && <button type="button" className="button" onClick={() => go(next.id)}>{!initial ? "Salvar e continuar" : `Ir para ${next.label.toLowerCase()}`}<ArrowRight size={18} /></button>}
        </div></div>
        <p className="editor-save-note" role="status">{message || (!initial ? "O projeto será criado ao continuar." : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Confira o aviso de armazenamento." : "Alterações salvas neste navegador.")}</p>
      </>}
      status={<>
        <FabricationSeal result={declared ? null : generated.result} declaredIssues={declaredIssues} />
        {declared ? <DeclaredSafetyWarning /> : <GeneratedSafetyWarning />}
        <div className="studio-status-data">
          {!declared && <GeneratedTotals result={generated.result} />}
          <LiveTotals totals={totals} includeGeometry={declared} />
          <AnalysisState onOpenAnalysis={() => openTool("mixedlocal")} />
        </div>
      </>}
    />
  </>;
}

function analysisToolLabel(tool: AnalysisTool) {
  return { overview: "Roteiro estrutural", analysis: "Análise disponível", spatial: "Análise 3D experimental", mixedlocal: "Análise Estrutural Experimental" }[tool];
}

function DeclaredModelParts({ project, selected, onSelect, nodeId, onSelectNode, analysisColors, deformed, labels, onApi, onHover }: {
  project: Project; selected: string; onSelect: (id: string) => void; nodeId: string; onSelectNode: (id: string) => void;
  analysisColors?: Record<string, number>; deformed?: { a: [number, number, number]; b: [number, number, number] }[] | null;
  labels?: import("./structure-3d").Viewer3DLabel[]; onApi?: (api: Viewer3DApi | null) => void; onHover?: (id: string) => void;
}) {
  const declared = useDeclaredModel(project);
  return <DeclaredViewport project={project} declared={declared} selected={selected} onSelect={onSelect} nodeId={nodeId} onSelectNode={onSelectNode}
    analysisColors={analysisColors} deformed={deformed} labels={labels} onApi={onApi} onHover={onHover} />;
}
function DeclaredMaterialsPart({ project }: { project: Project }) {
  const declared = useDeclaredModel(project);
  return <DeclaredMaterials declared={declared} />;
}
