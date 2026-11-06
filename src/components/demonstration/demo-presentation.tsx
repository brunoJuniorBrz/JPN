"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, Hammer, PlayCircle, Ruler } from "lucide-react";
import type { Project } from "@/domain/models";
import { tomSource } from "@/domain/client-demonstration";
import { TomDemonstrationButton } from "./demo-entry";

type DemoTab = "Visão geral" | "Modelo" | "Materiais" | "Orçamento" | "Engenharia";

const commercialSteps: DemoTab[] = ["Visão geral", "Modelo", "Materiais", "Orçamento", "Engenharia"];
const mathematicalSteps: DemoTab[] = ["Visão geral", "Modelo", "Engenharia"];
const tips: Record<DemoTab, string> = {
  "Visão geral": "Comece pelos dados conhecidos da obra e explique o objetivo da demonstração.",
  "Modelo": "Mostre a diferença entre o desenho real ainda pendente e um modelo matemático de exemplo.",
  "Materiais": "Confira as quantidades comerciais, sem confundi-las com um plano de corte.",
  "Orçamento": "Confira o valor original e gere o PDF para levar à reunião.",
  "Engenharia": "Registre o que o Tom sabe sobre a montagem e veja o cálculo de validação separado.",
};

export function DemoPresentationJourney({
  mathematical, currentTab, onNavigate,
}: {
  mathematical: boolean; currentTab: DemoTab; onNavigate: (tab: DemoTab) => void;
}) {
  const steps = mathematical ? mathematicalSteps : commercialSteps;
  const position = steps.indexOf(currentTab);
  const atEnd = position === steps.length - 1;
  const shown = position >= 0 ? position : 0;
  const next = position < 0 ? "Visão geral" : atEnd ? "Visão geral" : steps[position + 1];
  const mathematicalTips: Partial<Record<DemoTab,string>> = {
    "Visão geral": "Esta estrutura é sintética. Explique por que ela não representa a obra do Tom.",
    "Modelo": "Mostre as três barras, os apoios e a carga uniforme informados no exemplo.",
    "Engenharia": "Execute o Python real, se disponível, ou consulte a evidência histórica claramente identificada.",
  };
  return <section className="demo-journey" aria-label="Roteiro de apresentação" data-testid="demo-presentation-journey">
    <div className="demo-journey-heading">
      <div><span className="demo-mini-eyebrow">ROTEIRO DA DEMONSTRAÇÃO</span>
        <h2>{mathematical ? "Como apresentar o cálculo de exemplo" : "Como apresentar esta obra ao Tom"}</h2>
      </div>
      <span className="demo-journey-position">{position < 0 ? "Navegação livre" : `Etapa ${position + 1} de ${steps.length}`}</span>
    </div>
    <div className="demo-journey-meter" role="progressbar" aria-label="Progresso do roteiro"
      aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={position < 0 ? 0 : position + 1}>
      <span style={{width:`${position < 0 ? 0 : ((position + 1) / steps.length) * 100}%`}}/>
    </div>
    <div className="demo-journey-bottom">
      <p>{mathematical ? mathematicalTips[currentTab] ?? tips[currentTab] : tips[currentTab]}</p>
      <button type="button" className="button secondary demo-journey-next" onClick={()=>onNavigate(next)}>
        {atEnd ? "Voltar ao início" : position < 0 ? "Retomar roteiro" : `Próxima: ${next}`}
        <ArrowRight size={16} aria-hidden="true"/>
      </button>
    </div>
  </section>;
}

export function DemoLanding({projectId, saved}: {projectId?:string;saved:Project[]}) {
  return <div className="demo-landing" data-testid="demo-landing">
    <div className="demo-landing-hero">
      <div className="demo-landing-copy">
        <span className="demo-mini-eyebrow">JPN · APRESENTAÇÃO AO CLIENTE</span>
        <h1>Uma cobertura real. Um sistema para acompanhar toda a obra.</h1>
        <p>Abra uma cópia do orçamento do Tom, confira materiais e veja uma demonstração separada do motor estrutural. Sem preencher formulários ou importar arquivos.</p>
        <TomDemonstrationButton/>
        <p className="demo-landing-safety"><CheckCircle2 size={16} aria-hidden="true"/> A cópia é salva somente neste navegador. Suas outras obras não são alteradas.</p>
      </div>
      <div className="demo-landing-facts" aria-label="Dados comerciais da referência">
        <span className="demo-mini-eyebrow">DADOS CONFIRMADOS</span>
        <strong className="demo-landing-total">R$ 9.651,29</strong>
        <p>Valor do orçamento comercial de referência, não dimensionamento ou proposta aprovada.</p>
        <div className="demo-landing-metrics">
          <span><b>{tomSource.roofing_sheet.total_pieces}</b><small>telhas</small></span>
          <span><b>{tomSource.roofing_sheet.total_linear_m.toLocaleString("pt-BR")} m</b><small>lineares de telha</small></span>
        </div>
        <span className="demo-landing-pending">Geometria real e verificações estruturais: pendentes</span>
      </div>
    </div>
    <div className="demo-landing-steps">
      <div><FileText size={22} aria-hidden="true"/><b>1. Ver o orçamento</b><p>Quantidades e valores reais da planilha.</p></div>
      <div><Ruler size={22} aria-hidden="true"/><b>2. Conferir o que falta</b><p>Dados de montagem para o Tom informar.</p></div>
      <div><PlayCircle size={22} aria-hidden="true"/><b>3. Demonstrar o motor</b><p>Cálculo de um exemplo, separado da obra.</p></div>
    </div>
    {projectId&&<p className="demo-landing-missing" role="alert">Não foi encontrada uma cópia com esse identificador neste navegador. Abra uma nova ou restaure seu backup.</p>}
    <section className="demo-landing-saved" aria-label="Demonstrações salvas">
      <div className="demo-landing-saved-heading"><ClipboardList size={20} aria-hidden="true"/><h2>Suas demonstrações neste navegador</h2></div>
      {saved.length ? <ul>{saved.map(p=><li key={p.id}><Link href={`/demonstracao?projeto=${p.id}`}>{p.name}<ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ul>
        : <p>Nenhuma cópia criada ainda. Use o botão acima para começar.</p>}
      <Link className="demo-landing-project-link" href="/projetos"><Hammer size={16} aria-hidden="true"/> Voltar a todos os projetos</Link>
    </section>
  </div>;
}
