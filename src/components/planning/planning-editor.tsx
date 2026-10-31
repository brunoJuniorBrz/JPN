"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Box, Save } from "lucide-react";
import { newProject, projectSchema, type Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { useData } from "@/components/data-provider";
import { PageHeading } from "@/components/ui";
import { GeneralForm } from "@/components/projects/general-form";
import { RoofForm } from "@/components/geometry/roof-form";
import { StructureForm } from "./structure-form";
import { TakeoffSummary } from "./takeoff-summary";
import { ProjectWorkbench } from "./project-workbench";
import type { PieceRole } from "@/domain/structure";

const steps = ["Obra", "Medidas", "Estrutura", "Resultado"];
export function PlanningEditor({ initial, initialStep = 0, initialOpen3D = false }: { initial?: Project; initialStep?: number; initialOpen3D?: boolean }) {
  const { data, saveProject, flush, saveState, setInvalidDraft } = useData(); const router = useRouter();
  const [project, setProject] = useState(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState(initialStep), [submitted, setSubmitted] = useState(false), [message, setMessage] = useState("");
  const [profileToEdit, setProfileToEdit] = useState<PieceRole>();
  const [open3D, setOpen3D] = useState(initialOpen3D);
  const [open3DRequest, setOpen3DRequest] = useState(0);
  const preview = useMemo(() => generateStructure(project), [project]);
  const parsed = projectSchema.safeParse(project);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]));
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  useEffect(() => {
    if (step !== 3 || !open3D) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("jpn-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [step, open3D]);
  function update(patch: Partial<Project>) {
    const next = { ...project, ...patch }; setProject(next); setMessage("");
    const result = projectSchema.safeParse(next); setInvalidDraft(!initial || !result.success);
    if (initial && result.success) saveProject(result.data);
  }
  function go(target: number, request3D = false) {
    setSubmitted(true); if (!parsed.success) { setStep(0); return; }
    if (!initial) { saveProject(parsed.data); if (flush()) { setInvalidDraft(false); router.replace(`/projetos/${project.id}?fluxo=levantamento&etapa=${target}${request3D ? "&vista=3d" : ""}`); } }
    else { setStep(target); setOpen3D(request3D); if (request3D) setOpen3DRequest(n => n + 1); setSubmitted(false); if (!request3D) window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function save() { if (!parsed.success) { setSubmitted(true); setStep(0); return; } saveProject(parsed.data); if (flush()) setMessage("Levantamento salvo neste navegador."); }
  return <><Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link><PageHeading eyebrow="DA MEDIDA À LISTA DE MATERIAIS" title={project.name || "Vamos começar sua obra"} description="Informe a obra, configure a geometria e veja as peças e os quantitativos." />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Medidas, distribuição e perfis apenas para demonstrar o cálculo geométrico.</p>}
    <section className="panel workflow-panel"><nav className="workflow-steps planning-steps" aria-label="Etapas do levantamento">{steps.map((label, i) => <button key={label} type="button" className={step === i ? "current" : ""} aria-current={step === i ? "step" : undefined} onClick={() => go(i)}><span>{i + 1}</span>{label}</button>)}</nav><p className="workflow-progress">Passo {step + 1} de 4 — {steps[step]}</p>
      <div className="viewer-shortcut"><button type="button" className="button secondary" onClick={() => {
        if (preview.model) { go(3, true); return; }
        setMessage(preview.pending[0] ?? "Complete as medidas e a estrutura para visualizar o modelo 3D.");
        const roof = project.roof;
        go(roof.widthM === null || roof.lengthM === null || roof.lowHeightM === null || roof.slopePercent === null ? 1 : 2);
      }}><Box size={19} />{preview.model ? "Abrir modelo 3D" : "Configurar modelo 3D"}</button><span className="field-hint">{preview.model ? "Visualização 3D da estrutura disponível também no celular." : `Para visualizar em 3D: ${preview.pending[0] ?? "complete a estrutura"}`}</span></div>
      <div className="workflow-content">
        {step === 0 && <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />}
        {step === 1 && (project.category === "Cobertura metálica" ? <RoofForm typology={project.planning?.typology} roof={project.roof} onChange={roof => update({ roof })} planning /> : <p className="notice">A geração de peças atende coberturas de uma água nesta versão. O orçamento de venda continua disponível para outras categorias.</p>)}
        {step === 2 && <StructureForm project={project} onChange={update} profileToEdit={profileToEdit} />}
        {step === 3 && <><TakeoffSummary project={project} startIn3D={open3D} open3DRequest={open3DRequest} onConfigureProfile={role => { setProfileToEdit(role); go(2); }} /><ProjectWorkbench project={project} onChange={update} /></>}
      </div>
      <div className="workflow-footer"><span className="field-hint">Quantitativos independentes de preços</span><div className="actions">{step > 0 && <button type="button" className="button secondary" onClick={() => go(step - 1)}><ArrowLeft size={18} />Voltar</button>}{step < 3 ? <button type="button" className="button" onClick={() => go(step + 1)}>{!initial ? "Salvar e continuar" : `Ir para ${steps[step + 1].toLowerCase()}`}<ArrowRight size={18} /></button> : <button type="button" className="button" onClick={save}><Save size={18} />Salvar levantamento</button>}</div></div>
      <p className="editor-save-note" role="status">{message || (!initial ? "O projeto será criado ao continuar." : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Confira o aviso de armazenamento." : "Alterações salvas neste navegador.")}</p>
    </section></>;
}
