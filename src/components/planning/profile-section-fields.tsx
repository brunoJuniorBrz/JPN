"use client";
import { NumberField } from "@/components/number-field";
import { Field, Select } from "@/components/ui";
import { familyLabels, resolveSection, sectionDimensions, visualSectionSchema, type VisualSection } from "@/domain/profile-section";
import { sectionDataSchema, type ProfileSpec } from "@/domain/structure";

export function ProfileSectionFields({ value, onChange }: { value: ProfileSpec; onChange: (value: ProfileSpec) => void }) {
  const v = value.visualSection, data = value.data ?? sectionDataSchema.parse({});
  const change = (patch: Record<string, unknown>) => onChange({ ...value, visualSection: visualSectionSchema.parse({ ...v, ...patch }) });
  const resolution = resolveSection(value);
  return <details className="technical-details"><summary>Geometria da seção para visualização 3D</summary>
    <Field label="Família geométrica 3D"><Select value={v?.family ?? ""} onChange={e => {
      if (!e.target.value) { const { visualSection: _visual, ...rest } = value; void _visual; onChange(rest); return; }
      const family = e.target.value as VisualSection["family"];
      onChange({ ...value, data: { ...data, kind: family.endsWith("tube") ? "tube" : family as "i" | "channel" | "angle" }, visualSection: visualSectionSchema.parse({ family, rollDeg: v?.rollDeg ?? 0 }) });
    }}><option value="">Não cadastrada · usar linhas</option>{Object.entries(familyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
    {v && <>
      {sectionDimensions[v.family].map(([key, label]) => <NumberField key={`${v.family}-${key}`} label={`${label} 3D (mm)`} value={(v as unknown as Record<string, number | null>)[key]} min={.001} max={3000} onChange={n => change({ [key]: n })} />)}
      {v.family !== "i" && <NumberField label="Espessura uniforme 3D (mm)" value={data.thicknessMm} min={.001} max={3000} onChange={thicknessMm => onChange({ ...value, data: { ...data, thicknessMm } })} hint="Usa a mesma espessura das propriedades técnicas." />}
      {v.family === "channel" && <Field label="Abertura U/C"><Select value={v.opening} onChange={e => change({ opening: e.target.value })}><option value="positive-x">+X local</option><option value="negative-x">−X local</option></Select></Field>}
      <NumberField label="Giro axial visual (graus)" value={v.rollDeg} min={0} max={360} onChange={n => change({ rollDeg: n ?? 0 })} />
      <p className="field-hint">{resolution.dimensions}. {resolution.warning || "Seção ideal completa para visualização."}</p>
    </>}
    <p className="field-hint">Informe medidas da fonte. Sem raios, filetes ou tolerâncias presumidos. Estes campos não calculam massa, área resistente ou inércias. Referência de orientação disponível ao selecionar a peça.</p>
  </details>;
}
