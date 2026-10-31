"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Box, Settings2 } from "lucide-react";
import { useData } from "@/components/data-provider";
import { NumberField } from "@/components/number-field";
import { Field, Input, PageHeading, Select } from "@/components/ui";
import { createQuickProject, type QuickProjectInput } from "@/domain/quick-project";

export function QuickProjectForm({ onAdvanced }: { onAdvanced: () => void }) {
  const router = useRouter();
  const { data, saveProject, flush } = useData();
  const [typology, setTypology] = useState<QuickProjectInput["typology"]>("gable");
  const [widthM, setWidthM] = useState<number | null>(null);
  const [lengthM, setLengthM] = useState<number | null>(null);
  const [heightM, setHeightM] = useState<number | null>(null);
  const [slopePercent, setSlopePercent] = useState<number | null>(10);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = widthM !== null && lengthM !== null && heightM !== null && slopePercent !== null;

  function create() {
    if (!ready || busy) return;
    setError(""); setBusy(true);
    try {
      const project = createQuickProject({
        typology, widthM, lengthM, heightM, slopePercent, name, client,
      }, data.settings);
      saveProject(project);
      if (!flush()) { setError("Não foi possível salvar. Confira o armazenamento antes de sair."); return; }
      router.push(`/projetos/${project.id}?fluxo=levantamento&etapa=3&vista=3d`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o pré-projeto.");
    } finally { setBusy(false); }
  }

  return <>
    <Link href="/projetos" className="back-link"><ArrowLeft size={18}/>Todos os projetos</Link>
    <PageHeading eyebrow="ENTRADA RÁPIDA · JPN" title="Seu projeto em 3D, sem burocracia" description="Informe as medidas. O JPN monta uma configuração geométrica inicial editável e abre o modelo 3D completo."/>
    <section className="panel quick-start-panel" aria-label="Criar projeto rápido">
      <div className="quick-start-title"><Box size={24}/><div><h2>Gerar pré-projeto</h2><p>Comece com apenas três medidas e o formato da cobertura.</p></div></div>
      <Field label="Formato da cobertura"><Select value={typology} onChange={event => setTypology(event.target.value as QuickProjectInput["typology"])}><option value="mono">Cobertura de uma água</option><option value="gable">Cobertura de duas águas</option></Select></Field>
      <div className="quick-start-measures">
        <NumberField label="Largura (m)" value={widthM} onChange={setWidthM} min={2} max={40} hint="Vão transversal da cobertura."/>
        <NumberField label="Comprimento (m)" value={lengthM} onChange={setLengthM} min={2} max={100} hint="Medida longitudinal."/>
        <NumberField label="Altura (m)" value={heightM} onChange={setHeightM} min={2} max={30} hint="Altura inicial da borda baixa."/>
      </div>
      <details className="quick-start-options"><summary>Detalhes opcionais (podem ficar para depois)</summary>
        <div className="quick-start-measures">
          <Field label="Nome do projeto"><Input maxLength={200} value={name} placeholder="Gerado pelas medidas" onChange={event => setName(event.target.value)}/></Field>
          <Field label="Cliente"><Input maxLength={200} value={client} placeholder="Informar mais tarde" onChange={event => setClient(event.target.value)}/></Field>
          <NumberField label="Inclinação visual inicial (%)" value={slopePercent} min={0} max={40} decimals={2} onChange={setSlopePercent} hint="10% é apenas o valor inicial para desenhar. Confirme na obra."/>
        </div>
      </details>
      <div className="notice quick-start-warning"><strong>Modelo preliminar editável</strong><p>O JPN sugere a distribuição das barras e usa perfis sintéticos para o 3D. Não são perfis escolhidos por cálculo de resistência. O aço, as cargas, o vento, os apoios e as ligações precisam de definição e verificação antes da compra e do corte.</p></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="quick-start-actions"><button type="button" className="button quick-start-primary" disabled={!ready || busy} onClick={create}><Box size={20}/>{busy ? "Criando pré-projeto…" : "Gerar modelo 3D"}<ArrowRight size={18}/></button><button type="button" className="button secondary" onClick={onAdvanced}><Settings2 size={18}/>Usar cadastro completo</button></div>
      <p className="field-hint">Depois do 3D, altere espaçamentos, medidas e seções a qualquer momento; os quantitativos geométricos são recalculados.</p>
    </section>
  </>;
}
