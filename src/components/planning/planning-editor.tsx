"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { newProject, projectSchema, type Project } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { PageHeading } from "@/components/ui";
import { GeneralForm } from "@/components/projects/general-form";
import { RoofForm } from "@/components/geometry/roof-form";
import { StructureForm } from "./structure-form";
import { TakeoffSummary } from "./takeoff-summary";

const steps = ["Obra", "Medidas", "Estrutura", "Resultado"];
export function PlanningEditor({ initial, initialStep = 0 }: { initial?: Project; initialStep?: number }) {
  const { data, saveProject, flush, saveState, setInvalidDraft } = useData(); const router = useRouter();
  const [project, setProject] = useState(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState(initialStep), [submitted, setSubmitted] = useState(false), [message, setMessage] = useState("");
  const parsed = projectSchema.safeParse(project);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]));
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  function update(patch: Partial<Project>) {
    const next = { ...project, ...patch }; setProject(next); setMessage("");
    const result = projectSchema.safeParse(next); setInvalidDraft(!initial || !result.success);
    if (initial && result.success) saveProject(result.data);
  }
  function go(target: number) {
    setSubmitted(true); if (!parsed.success) { setStep(0); return; }
    if (!initial) { saveProject(parsed.data); if (flush()) { setInvalidDraft(false); router.replace(`/projetos/${project.id}?fluxo=levantamento&etapa=${target}`); } }
    else { setStep(target); setSubmitted(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function save() { if (!parsed.success) { setSubmitted(true); setStep(0); return; } saveProject(parsed.data); if (flush()) setMessage("Levantamento salvo neste navegador."); }
  return <><Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link><PageHeading eyebrow="DA MEDIDA À LISTA DE MATERIAIS" title={project.name || "Vamos começar sua obra"} description="Informe a obra, configure a geometria e veja as peças e os quantitativos." />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Medidas, distribuição e perfis apenas para demonstrar o cálculo geométrico.</p>}
    <section className="panel workflow-panel"><nav className="workflow-steps planning-steps" aria-label="Etapas do levantamento">{steps.map((label, i) => <button key={label} type="button" className={step === i ? "current" : ""} aria-current={step === i ? "step" : undefined} onClick={() => go(i)}><span>{i + 1}</span>{label}</button>)}</nav><p className="workflow-progress">Passo {step + 1} de 4 — {steps[step]}</p>
      <div className="workflow-content">
        {step === 0 && <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />}
        {step === 1 && (project.category === "Cobertura metálica" ? <RoofForm roof={project.roof} onChange={roof => update({ roof })} planning /> : <p className="notice">A geração de peças atende coberturas de uma água nesta versão. O orçamento de venda continua disponível para outras categorias.</p>)}
        {step === 2 && <StructureForm project={project} onChange={update} />}
        {step === 3 && <TakeoffSummary project={project} />}
      </div>
      <div className="workflow-footer"><span className="field-hint">Quantitativos independentes de preços</span><div className="actions">{step > 0 && <button type="button" className="button secondary" onClick={() => go(step - 1)}><ArrowLeft size={18} />Voltar</button>}{step < 3 ? <button type="button" className="button" onClick={() => go(step + 1)}>{!initial ? "Salvar e continuar" : `Ir para ${steps[step + 1].toLowerCase()}`}<ArrowRight size={18} /></button> : <button type="button" className="button" onClick={save}><Save size={18} />Salvar levantamento</button>}</div></div>
      <p className="editor-save-note" role="status">{message || (!initial ? "O projeto será criado ao continuar." : saveState === "pending" ? "Salvando…" : saveState === "error" ? "Confira o aviso de armazenamento." : "Alterações salvas neste navegador.")}</p>
    </section></>;
}
