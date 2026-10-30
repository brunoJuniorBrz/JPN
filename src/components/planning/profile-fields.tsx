"use client";
import { Field, Input } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import type { ProfileSpec } from "@/domain/structure";

export function ProfileFields({ value, onChange }: { value: ProfileSpec; onChange: (value: ProfileSpec) => void }) {
  const update = (patch: Partial<ProfileSpec>) => onChange({ ...value, ...patch });
  return <div className="form-grid">
    <Field label="Designação do perfil"><Input value={value.name} maxLength={200} onChange={e => update({ name: e.target.value })} placeholder="Nome e código do catálogo" /></Field>
    <Field label="Classe do aço"><Input value={value.steelGrade} maxLength={200} onChange={e => update({ steelGrade: e.target.value })} /></Field>
    <Field label="Dimensões e espessuras da seção"><Input value={value.section} maxLength={500} onChange={e => update({ section: e.target.value })} placeholder="Copie os dados do fabricante" /></Field>
    <NumberField label="Massa por metro (kg/m)" value={value.massKgM} min={.001} max={10000} onChange={massKgM => update({ massKgM })} hint="Valor do catálogo; vazio mantém a massa pendente." />
    <NumberField label="Comprimento comercial (m)" value={value.stockLengthM} min={.001} max={100} onChange={stockLengthM => update({ stockLengthM })} />
    <Field label="Fonte da especificação"><Input value={value.source} maxLength={1000} onChange={e => update({ source: e.target.value })} placeholder="Fabricante, catálogo, edição ou referência recebida" /></Field>
  </div>;
}
