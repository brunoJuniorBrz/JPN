"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Save, Check } from "lucide-react";
import { newProject, projectSchema, type Project } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { PageHeading, Status } from "@/components/ui";
import { GeneralForm } from "./general-form";
import { RoofForm } from "@/components/geometry/roof-form";
import { MaterialItems } from "@/components/estimates/material-items";
import { CostsForm } from "@/components/estimates/costs-form";
import { EstimateSummary } from "@/components/estimates/estimate-summary";
import { calculateEstimate, moneyLabel } from "@/domain/calculations/estimate";

const steps = ["Cliente", "Medidas", "Materiais", "Custos", "Resumo"];
export function ProjectEditor({ initial, initialStep = 0 }: { initial?: Project; initialStep?: number }) {
  const { data, saveProject, flush, saveState, invalidDraft, setInvalidDraft } = useData();
  const [project, setProject] = useState<Project>(() => initial ?? newProject(data.settings));
  const [step, setStep] = useState(initialStep), [submitted, setSubmitted] = useState(false), [savedMessage, setSavedMessage] = useState("");
  const router = useRouter();
  const parsed = projectSchema.safeParse(project), estimate = calculateEstimate(project);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]));
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  function update(patch: Partial<Project>) {
    const next = { ...project, ...patch }; setProject(next); setSavedMessage("");
    const result = projectSchema.safeParse(next); setInvalidDraft(!initial || !result.success);
    if (initial && result.success) saveProject(result.data);
  }
  function go(target: number) {
    if (initial && invalidDraft && parsed.success) {
      if (!window.confirm("Há um material ainda não salvo. Deseja sair desta etapa e descartar o cadastro desse material?")) return;
      setInvalidDraft(false);
    }
    setSubmitted(true); if (!parsed.success) { setStep(0); return; }
    if (!initial) {
      saveProject(parsed.data);
      if (flush()) { setInvalidDraft(false); router.replace(`/projetos/${project.id}?etapa=${target}`); }
    } else { setStep(target); setSubmitted(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function save() {
    setSubmitted(true); if (!parsed.success) { setStep(0); return; }
    saveProject(parsed.data); if (flush()) { setInvalidDraft(false); setSavedMessage("Tudo salvo neste navegador."); }
  }
  return <><Link href="/projetos" className="back-link"><ArrowLeft size={18} />Todos os projetos</Link><PageHeading eyebrow="DA MEDIDA AO ORÇAMENTO" title={initial ? project.name || "Editar projeto" : "Vamos começar sua obra"} description={initial ? "Siga os passos abaixo. Cada alteração válida é salva automaticamente." : "Preencha o cliente e a obra. Depois vamos às medidas e aos custos."} action={initial ? <Status value={project.status} /> : undefined} />
    {project.isExample && <p className="example-banner">EXEMPLO FICTÍCIO · Altere as medidas e os preços para aprender. Estes valores não são cotações de mercado.</p>}
    <section className="panel workflow-panel"><nav className="workflow-steps" aria-label="Etapas do projeto">{steps.map((label, i) => <button key={label} type="button" aria-current={step === i ? "step" : undefined} className={step === i ? "current" : ""} onClick={() => go(i)}><span>{i + 1}</span>{label}</button>)}</nav><p className="workflow-progress">Passo {step + 1} de 5 — {steps[step]}</p>
      <div className="workflow-content">
        {step === 0 && <GeneralForm project={project} onChange={update} errors={submitted || initial ? errors : {}} />}
        {step === 1 && (project.category === "Cobertura metálica" ? <RoofForm roof={project.roof} onChange={roof => update({ roof })} /> : <div className="empty-state"><h2>Desenho disponível para coberturas simples</h2><p>Esta categoria ainda não tem gerador geométrico. Você pode continuar e montar o orçamento com quantidades manuais.</p></div>)}
        {step === 2 && <MaterialItems project={project} onChange={materials => update({ estimate: { ...project.estimate, materials } })} />}
        {step === 3 && <CostsForm estimate={project.estimate} onChange={estimate => update({ estimate })} />}
        {step === 4 && <EstimateSummary project={project} onChange={update} />}
      </div><div className="workflow-footer"><div className="workflow-running-total"><span>Venda estimada</span><strong>{estimate.saleCents === null ? "A preencher" : moneyLabel(estimate.saleCents)}</strong></div><div className="actions">{step > 0 && <button type="button" className="button secondary" onClick={() => go(step - 1)}><ArrowLeft size={18} />Voltar</button>}{step < 4 ? <button type="button" className="button" onClick={() => go(step + 1)}>{!initial ? "Salvar e continuar" : `Ir para ${steps[step + 1].toLowerCase()}`}<ArrowRight size={18} /></button> : <button type="button" className="button" onClick={save}><Save size={18} />Salvar orçamento</button>}</div></div><p className="editor-save-note" role="status">{savedMessage ? <><Check size={16} />{savedMessage}</> : !initial ? "Seu projeto será criado ao clicar em Salvar e continuar." : !parsed.success ? "Corrija os dados do cliente para salvar." : saveState === "pending" ? "Salvando alterações…" : saveState === "error" ? "Não foi possível salvar. Confira o aviso no início da página." : "Alterações salvas neste navegador."}</p>
    </section></>;
}
