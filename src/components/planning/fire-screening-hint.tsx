"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import { NumberField } from "@/components/number-field";
import { SP_FIRE_RULESET, SP_FIRE_OCCUPANCIES, type SpFireOccupancy } from "@/domain/fire-rules-sp";
import { assessSpFireScreening, findSpGeometricScenario, type FireProjectContext } from "@/domain/fire-feasibility-sp";

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Auxílio de triagem NÃO homologado. Não modifica projeto, orçamento ou modelo 3D. */
export function FireScreeningHint({ widthM, lengthM }: { widthM: number | null; lengthM: number | null }) {
  const [context, setContext] = useState<FireProjectContext>("unknown");
  const [occupancy, setOccupancy] = useState<SpFireOccupancy | null>(null);
  const [legalHeightM, setLegalHeightM] = useState<number | null>(null);
  const [mezzanineAreaM2, setMezzanineAreaM2] = useState<number | null>(null);
  const [additionalBuiltAreaM2, setAdditionalBuiltAreaM2] = useState<number | null>(null);
  const [footprintConfirmed, setFootprintConfirmed] = useState(false);
  const [terrainWidthM, setTerrainWidthM] = useState<number | null>(null);
  const [terrainLengthM, setTerrainLengthM] = useState<number | null>(null);
  const [sideM, setSideM] = useState<number | null>(null);
  const [frontM, setFrontM] = useState<number | null>(null);
  const [rearM, setRearM] = useState<number | null>(null);
  const [minimumOperationalAreaM2, setMinimumOperationalAreaM2] = useState<number | null>(null);
  const input = {
    context, occupancy, widthM, lengthM, legalHeightM, mezzanineAreaM2, additionalBuiltAreaM2,
    footprintConfirmed,
    minimumOperationalAreaM2,
    terrain: terrainWidthM !== null && terrainLengthM !== null ? {
      widthM: terrainWidthM, lengthM: terrainLengthM,
      setbackSideM: sideM ?? undefined, setbackFrontM: frontM ?? undefined, setbackRearM: rearM ?? undefined,
    } : undefined,
  };
  const result = assessSpFireScreening(input);
  const alternative = findSpGeometricScenario(input);
  if (result.geometryAreaM2 === null) return null;
  const above = result.geometryAreaM2 > SP_FIRE_RULESET.areaThresholdM2;
  return <aside className="notice" aria-label="Triagem preliminar de incêndio SP">
    <strong>Viabilidade preliminar · Bombeiros SP</strong>
    <p>
      Projeção geométrica: <strong>{fmt(result.geometryAreaM2)} m²</strong>.
      {above ? " Acima do marco de área de 750 m² da Tabela 5." : " Não ultrapassa o marco de área de 750 m² da Tabela 5."}
      {" "}A projeção não determina sozinha o enquadramento.
    </p>
    <p className="field-hint">Regras não homologadas para recomendação de obra. A altura da cobertura não equivale à altura regulamentar; sem dados adicionais, não se concluem exigências nem isenções.</p>
    <details>
      <summary>Conferir contexto da obra e possíveis alternativas (opcional)</summary>
      <div className="form-grid">
        <Field label="Situação da construção"><Select value={context} onChange={e=>setContext(e.target.value as FireProjectContext)}>
          <option value="unknown">Ainda não informada</option>
          <option value="new-building">Galpão novo</option>
          <option value="existing-building">Reforma / obra existente</option>
          <option value="open-roof">Cobertura aberta</option>
        </Select></Field>
        <Field label="Ocupação inicial (a confirmar)"><Select value={occupancy ?? ""} onChange={e=>setOccupancy(e.target.value ? e.target.value as SpFireOccupancy : null)}>
          <option value="">A definir</option>
          {(Object.entries(SP_FIRE_OCCUPANCIES) as [SpFireOccupancy, string][]).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </Select></Field>
        <NumberField label="Altura regulamentar confirmada (m)" value={legalHeightM} onChange={setLegalHeightM} min={0} max={200} hint="Não é a altura do telhado; usar definição legal." />
        <NumberField label="Área de mezanino (m²)" value={mezzanineAreaM2} onChange={setMezzanineAreaM2} min={0} max={100000} hint="Informe zero se não houver." />
        <NumberField label="Demais áreas construídas (m²)" value={additionalBuiltAreaM2} onChange={setAdditionalBuiltAreaM2} min={0} max={100000} hint="Informe zero se não houver." />
      </div>
      <label className="field-hint"><input type="checkbox" checked={footprintConfirmed} onChange={e=>setFootprintConfirmed(e.target.checked)}/>{" "}Confirmo que largura × comprimento representa toda a área térrea do galpão novo.</label>
      <p className="field-hint">Só para comparar dimensões possíveis (sem validar recuos urbanísticos):</p>
      <div className="form-grid">
        <NumberField label="Largura do terreno (m)" value={terrainWidthM} onChange={setTerrainWidthM} min={1} max={10000}/>
        <NumberField label="Comprimento do terreno (m)" value={terrainLengthM} onChange={setTerrainLengthM} min={1} max={10000}/>
        <NumberField label="Recuo lateral por lado (m)" value={sideM} onChange={setSideM} min={0} max={1000}/>
        <NumberField label="Recuo frontal (m)" value={frontM} onChange={setFrontM} min={0} max={1000}/>
        <NumberField label="Recuo dos fundos (m)" value={rearM} onChange={setRearM} min={0} max={1000}/>
        <NumberField label="Área operacional mínima (m²)" value={minimumOperationalAreaM2} onChange={setMinimumOperationalAreaM2} min={1} max={100000}/>
      </div>
      <p><strong>Resultado:</strong> {result.status === "preliminary-band" ? `Faixa preliminar da Tabela ${result.table} identificada; exigências ainda não validadas.` :
        result.status === "technical-review" ? "Requer análise técnica específica." : "Dados insuficientes para o enquadramento."}</p>
      {result.screeningBuiltAreaM2 !== null && <p>Área conservadora para triagem: {fmt(result.screeningBuiltAreaM2)} m² (sem deduções automáticas do art. 18).</p>}
      <p className="field-hint">Hidrantes: {result.hydrants.note}</p>
      {alternative && <p><strong>Alternativa apenas geométrica:</strong> {fmt(alternative.widthM)} × {fmt(alternative.lengthM)} m ({fmt(alternative.geometricAreaM2)} m² de projeção). {alternative.note} Medidas do projeto não são alteradas.</p>}
      {!alternative && above && <p className="field-hint">Sem alternativa calculável: é preciso declarar terreno, recuos, área mínima operacional e composição da área da edificação. Nenhuma redução de exigências foi inferida.</p>}
      {result.missing.length > 0 && <p className="field-hint">Pendências: {result.missing.join(" ")}</p>}
      <p className="field-hint">Fonte: {result.rule.decree}, texto oficial consultado em {result.rule.verifiedFromOfficialTextOn.split("-").reverse().join("/")}; revisão por profissional de segurança contra incêndio pendente. <a href={result.rule.sources[0].url} target="_blank" rel="noopener noreferrer">Consultar decreto oficial</a>.</p>
    </details>
  </aside>;
}
