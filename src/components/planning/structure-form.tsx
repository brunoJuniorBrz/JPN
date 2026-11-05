"use client";
import type { Project } from "@/domain/models";
import { emptyPlanning, roles, roleLabels, type Planning, type PieceRole } from "@/domain/structure";
import { useData } from "@/components/data-provider";
import { Field, Select, Textarea } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { ProfileFields } from "./profile-fields";
import { PUBLISHED_PROFILE_CATALOG, catalogEntryById, planningProfileFromCatalog } from "@/domain/published-profile-catalog";

export function StructureForm({ project, onChange, profileToEdit }: { project: Project; onChange: (patch: Partial<Project>) => void; profileToEdit?: PieceRole }) {
  const config = project.planning ?? emptyPlanning(); const { data } = useData();
  const update = (patch: Partial<Planning>) => onChange({ planning: { ...config, ...patch } });
  return <section><h2>Como distribuir a estrutura?</h2><p className="muted">O sistema gera as linhas, os nós e as peças a partir destas medidas. Os espaçamentos são limites geométricos informados, ainda sem verificação de resistência.</p>
    <Field label="Tipologia da cobertura"><Select value={config.typology} onChange={e => update({ typology: e.target.value as Planning["typology"] })}><option value="mono">Uma água</option><option value="gable">Duas águas simétricas · cumeeira central</option></Select></Field>
    <div className="form-grid"><NumberField label="Balanço longitudinal na frente (m)" value={config.overhangStartM} min={0} max={20} onChange={v => update({ overhangStartM: v })} hint="Prolongamento geométrico das terças além da primeira tesoura." /><NumberField label="Balanço longitudinal no fundo (m)" value={config.overhangEndM} min={0} max={20} onChange={v => update({ overhangEndM: v })} hint="Não implica verificação estrutural do balanço." /></div>
    <div className="notice"><strong>{config.typology === "gable" ? "Duas águas simétricas" : "Modelo de uma água"}</strong><p>Banzo inferior horizontal, montantes e uma diagonal por painel. Dois pilares em cada linha de tesoura. Terças divididas nos vãos entre tesouras.</p></div>
    <div className="form-grid">
      <NumberField label="Espaçamento máximo entre tesouras (m)" value={config.frameSpacingM} min={.001} max={1000} onChange={frameSpacingM => update({ frameSpacingM })} hint="Inclui linhas nas duas extremidades e distribui os vãos igualmente." />
      <NumberField label="Espaçamento máximo entre terças (m)" value={config.purlinSpacingM} min={.001} max={1000} onChange={purlinSpacingM => update({ purlinSpacingM })} hint="Medido na superfície inclinada, incluindo as duas bordas." />
      <NumberField label="Altura da tesoura no lado baixo (m)" value={config.trussDepthM} min={.001} max={100} onChange={trussDepthM => update({ trussDepthM })} hint="Distância vertical entre banzos na borda baixa. Os pilares chegam ao banzo inferior." />
      <NumberField label="Número de painéis por tesoura" value={config.panels} min={1} max={40} decimals={0} onChange={panels => update({ panels })} hint="Divisões iguais ao longo do vão horizontal." />
    </div>
    <h3>Perfis usados no levantamento</h3><p className="muted">Você pode gerar as peças antes de definir os perfis. A massa é calculada quando houver kg/m. A seleção automática por resistência será incorporada ao motor de dimensionamento.</p>
    {roles.map(role => <details className="technical-details" data-profile-role={role} key={role} open={profileToEdit === role || undefined}><summary>{roleLabels[role]} · {config.profiles[role].name || "Perfil a definir"}</summary>
      <Field label={"Perfil publicado (massa e dimensões) — " + roleLabels[role]}><Select value="" onChange={e => {
        const chosen = catalogEntryById(e.target.value);
        if (chosen) update({ profiles: { ...config.profiles, [role]: planningProfileFromCatalog(chosen) } });
      }}>
        <option value="">Selecionar perfil técnico publicado, sem preço ou aprovação</option>
        {PUBLISHED_PROFILE_CATALOG.map(p => <option key={p.id} value={p.id}>{p.designation} · {p.massKgM.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg/m{p.requiresReview ? " · conferir massa/dimensões" : ""}</option>)}
      </Select></Field>
      <p className="field-hint">Dados de pesquisa de 01/11/2026: massa e dimensões nominais. Sem propriedades resistentes, A/I/J, classe do aço, preço, disponibilidade nem comprimento comercial presumido. A escolha não significa dimensionamento; você pode editar ou substituir tudo.</p>
      <Field label={`Copiar perfil do catálogo para ${roleLabels[role].toLowerCase()}`}><Select value="" onChange={e => { const profile = data.materials.find(m => m.id === e.target.value)?.technicalProfile; if (profile) update({ profiles: { ...config.profiles, [role]: { ...profile } } }); }}><option value="">Escolher um perfil cadastrado</option>{data.materials.filter(m => m.technicalProfile).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      <ProfileFields value={config.profiles[role]} expandGeometry={profileToEdit === role} onChange={profile => update({ profiles: { ...config.profiles, [role]: profile } })} />
    </details>)}
    <Field label="Hipóteses e observações do levantamento"><Textarea value={config.specificationNotes} maxLength={3000} onChange={e => update({ specificationNotes: e.target.value })} /></Field>
  </section>;
}
