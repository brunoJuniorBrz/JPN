"use client";
import { Field, Input, Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import type { ProfileSpec } from "@/domain/structure";
import { sectionDataSchema } from "@/domain/structure";

export function ProfileFields({ value, onChange }: { value: ProfileSpec; onChange: (value: ProfileSpec) => void }) {
  const update = (patch: Partial<ProfileSpec>) => onChange({ ...value, ...patch });
  const data = value.data ?? sectionDataSchema.parse({});
  return <div className="form-grid">
    <Field label="Designação do perfil"><Input value={value.name} maxLength={200} onChange={e => update({ name: e.target.value })} placeholder="Nome e código do catálogo" /></Field>
    <Field label="Classe do aço"><Input value={value.steelGrade} maxLength={200} onChange={e => update({ steelGrade: e.target.value })} /></Field>
    <Field label="Dimensões e espessuras da seção"><Input value={value.section} maxLength={500} onChange={e => update({ section: e.target.value })} placeholder="Copie os dados do fabricante" /></Field>
    <NumberField label="Massa por metro (kg/m)" value={value.massKgM} min={.001} max={10000} onChange={massKgM => update({ massKgM })} hint="Valor do catálogo; vazio mantém a massa pendente." />
    <NumberField label="Comprimento comercial (m)" value={value.stockLengthM} min={.001} max={100} onChange={stockLengthM => update({ stockLengthM })} />
    <Field label="Fonte da especificação"><Input value={value.source} maxLength={1000} onChange={e => update({ source: e.target.value })} placeholder="Fabricante, catálogo, edição ou referência recebida" /></Field>
    <NumberField label="Preço cotado por metro (R$/m)" value={value.pricePerMeterCents ?? null} money decimals={2} max={100000000} onChange={pricePerMeterCents => update({ pricePerMeterCents })} hint="Cotação explícita para o orçamento; sem valor presumido." />
    <details className="technical-details"><summary>Propriedades técnicas e rastreabilidade</summary>
      <Field label="Tipo de perfil"><Select value={data.kind} onChange={e => update({ data: { ...data, kind: e.target.value as typeof data.kind } })}>{[["unspecified", "Não informado"], ["tube", "Tubo"], ["angle", "Cantoneira"], ["channel", "U/C"], ["i", "I/H"], ["other", "Outro"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select></Field>
      {([["thicknessMm", "Espessura (mm)"], ["areaCm2", "Área da seção (cm²)"], ["elasticModulusGpa", "Módulo de elasticidade (GPa)"], ["iyCm4", "Inércia Iy (cm⁴)"], ["izCm4", "Inércia Iz (cm⁴)"]] as const).map(([key, label]) => <NumberField key={key} label={label} value={data[key]} min={.000001} max={1000000000} decimals={6} onChange={v => update({ data: { ...data, [key]: v } })} />)}
      <Field label="Origem das propriedades"><Select value={data.origin} onChange={e => update({ data: { ...data, origin: e.target.value as typeof data.origin } })}><option value="declared">Declaradas pelo fabricante / fonte</option><option value="calculated">Calculadas separadamente</option></Select></Field>
      <Field label="Data / edição da fonte"><Input value={data.sourceDate} maxLength={40} onChange={e => update({ data: { ...data, sourceDate: e.target.value } })} /></Field>
      <Field label="Referência do cálculo das propriedades"><Input value={data.calculationReference} maxLength={1000} onChange={e => update({ data: { ...data, calculationReference: e.target.value } })} /></Field>
      <p className="field-hint">Propriedades declaradas não significam perfil aprovado. E e A são necessários apenas para a análise axial disponível.</p>
    </details>
  </div>;
}
