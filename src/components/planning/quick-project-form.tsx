"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Box, Settings2 } from "lucide-react";
import { useData } from "@/components/data-provider";
import { NumberField } from "@/components/number-field";
import { Field, Input, PageHeading, Select } from "@/components/ui";
import { createQuickProject, type QuickProjectInput } from "@/domain/quick-project";
import { ChoiceCard, RoofShapeIcon, LiveRoofPreview } from "./quick-project-visuals";
import { GuidedPreferences } from "./guided-preferences";
import "./guided-quick-project.css";

export function QuickProjectForm({ onAdvanced }: { onAdvanced: () => void }) {
  const router = useRouter();
  const { data, saveProject, flush } = useData();
  const [typology, setTypology] = useState<QuickProjectInput["typology"]>("gable");
  const [widthM, setWidthM] = useState<number | null>(null);
  const [lengthM, setLengthM] = useState<number | null>(null);
  const [heightM, setHeightM] = useState<number | null>(null);
  const [slopePercent, setSlopePercent] = useState<number | null>(10);
  const [frameSpacingM, setFrameSpacingM] = useState(4);
  const [purlinSpacingM, setPurlinSpacingM] = useState(1.5);
  const [panels, setPanels] = useState<number | null>(null);
  const [enclosure, setEnclosure] = useState<"open" | "partial" | "closed">("open");
  const [support, setSupport] = useState<"columns" | "walls" | "unspecified">("unspecified");
  const [profileInterest, setProfileInterest] = useState<"unspecified" | "channel" | "lipped-channel" | "tube">("unspecified");
  const [location, setLocation] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = widthM !== null && lengthM !== null && heightM !== null && slopePercent !== null;
  const effectivePanels = panels ?? (widthM === null ? 6 : widthM <= 8 ? 4 : widthM <= 16 ? 6 : 8);

  function create() {
    if (!ready || busy) return;
    setError(""); setBusy(true);
    try {
      const project = createQuickProject({
        typology, widthM, lengthM, heightM, slopePercent, name, client, location,
        frameSpacingM, purlinSpacingM, panels: effectivePanels, preferences: { enclosure, support, profileInterest },
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
    <PageHeading eyebrow="ENTRADA RÁPIDA · JPN" title="Seu projeto em 3D, sem burocracia" description="Escolha o formato com desenhos simples, informe as medidas e personalize uma configuração geométrica editável."/>
    <section className="panel quick-start-panel guided-entry" aria-label="Criar projeto rápido">
      <div className="quick-start-title"><Box size={24}/><div><h2>Montar pré-projeto visual</h2><p>Um desenho inicial do barracão, passo a passo.</p></div></div>
      <div className="guided-layout"><div className="guided-controls">
        <div className="guided-section-title"><span>01</span><div><h3>Escolha o tipo de telhado</h3><p>Selecione uma das formas abaixo.</p></div></div>
        <div className="guided-choice-grid guided-choice-grid-two">
          <ChoiceCard active={typology==="mono"} title="Uma água" description="Uma queda de telhado" onClick={()=>setTypology("mono")} testId="guided-roof-mono"><RoofShapeIcon kind="mono"/></ChoiceCard>
          <ChoiceCard active={typology==="gable"} title="Duas águas" description="Duas quedas de telhado" onClick={()=>setTypology("gable")} testId="guided-roof-gable"><RoofShapeIcon kind="gable"/></ChoiceCard>
        </div>
      <Field label="Formato da cobertura"><Select value={typology} onChange={event => setTypology(event.target.value as QuickProjectInput["typology"])}><option value="mono">Cobertura de uma água</option><option value="gable">Cobertura de duas águas</option></Select></Field>
      <div className="guided-section-title"><span>02</span><div><h3>Quais são as medidas?</h3><p>Informe as dimensões em metros.</p></div></div>
      <div className="quick-start-measures">
        <NumberField label="Largura (m)" value={widthM} onChange={setWidthM} min={2} max={40} hint="Vão transversal da cobertura."/>
        <NumberField label="Comprimento (m)" value={lengthM} onChange={setLengthM} min={2} max={100} hint="Medida longitudinal."/>
        <NumberField label="Altura (m)" value={heightM} onChange={setHeightM} min={2} max={30} hint="Altura inicial da borda baixa."/>
      </div>
      <GuidedPreferences frameSpacingM={frameSpacingM} setFrameSpacingM={setFrameSpacingM} purlinSpacingM={purlinSpacingM} setPurlinSpacingM={setPurlinSpacingM} panels={effectivePanels} setPanels={setPanels} enclosure={enclosure} setEnclosure={setEnclosure} support={support} setSupport={setSupport} profileInterest={profileInterest} setProfileInterest={setProfileInterest}/>
      <details className="quick-start-options"><summary>Detalhes opcionais (podem ficar para depois)</summary>
        <div className="quick-start-measures">
          <Field label="Nome do projeto"><Input maxLength={200} value={name} placeholder="Gerado pelas medidas" onChange={event => setName(event.target.value)}/></Field>
          <Field label="Cliente"><Input maxLength={200} value={client} placeholder="Informar mais tarde" onChange={event => setClient(event.target.value)}/></Field>
          <Field label="Cidade da obra"><Input maxLength={200} value={location} placeholder="Ex.: Capão Bonito / SP" onChange={event => setLocation(event.target.value)}/></Field>
          <NumberField label="Inclinação visual inicial (%)" value={slopePercent} min={0} max={40} decimals={2} onChange={setSlopePercent} hint="10% é apenas o valor inicial para desenhar. Confirme na obra."/>
        </div>
      </details>
      </div><aside className="guided-preview-column"><LiveRoofPreview typology={typology} widthM={widthM} lengthM={lengthM} heightM={heightM} frameSpacingM={frameSpacingM} purlinSpacingM={purlinSpacingM}/></aside></div>
      <div className="notice quick-start-warning"><strong>Modelo preliminar editável</strong><p>O JPN sugere a distribuição das barras e usa perfis sintéticos para o 3D. Não são perfis escolhidos por cálculo de resistência. O aço, as cargas, o vento, os apoios e as ligações precisam de definição e verificação antes da compra e do corte.</p></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="quick-start-actions"><button type="button" className="button quick-start-primary" disabled={!ready || busy} onClick={create}><Box size={20}/>{busy ? "Criando pré-projeto…" : "Gerar modelo 3D"}<ArrowRight size={18}/></button><button type="button" className="button secondary" onClick={onAdvanced}><Settings2 size={18}/>Usar cadastro completo</button></div>
      <p className="field-hint">Depois do 3D, altere espaçamentos, medidas e seções a qualquer momento; os quantitativos geométricos são recalculados.</p>
    </section>
  </>;
}
