"use client";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Project } from "@/domain/models";
import { applyNbr6123WallWind, declareFacadeTraction, facadeInputOf, setPhysicalFacades, type RectangularFacadeInput } from "@/domain/facade-declaration";
import { applyNbr8681Combinations } from "@/domain/nbr8681-combinations";
import { provisionalNotices } from "@/domain/normative-provenance";
import data8681 from "../../../data/normas/nbr8681-2025-combinations.json";
import { NBR6123_EDITION } from "@/domain/nbr6123-edition";

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const permTypes = Object.entries(data8681.table1.types).map(([id, t]) => ({ id, label: (t as { label: string }).label }));
const psiRows = Object.entries(data8681.table6.rows).filter(([id]) => ["buildings-no-predominance", "buildings-predominance", "libraries-archives-warehouses-workshops-garages-roofs", "temperature"].includes(id)).map(([id, r]) => ({ id, label: (r as { label: string }).label.slice(0, 90) }));

/** INT-1d: facades, declared pressure, NBR 6123 wall wind and NBR 8681 combinations. Every action is an explicit user step;
 * sources that are not yet unified are applied as PROVISIONAL and the notice stays visible. */
export function NormativeIntegrationPanel({ project, onChange }: { project: Project; onChange: (next: Project) => void }) {
  const draft = project.workspace.spatialPreparation;
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const run = (fn: () => Project, ok: string) => { try { onChange(fn()); setMessage(ok); setError(""); } catch (e) { setError((e as Error).message); setMessage(""); } };
  let facades: RectangularFacadeInput[] | null;
  try { facades = draft?.physicalFacades?.facades.map(facadeInputOf) ?? []; } catch { facades = null; }
  const notices = provisionalNotices(draft?.normativeProvenance);
  // --- facade form
  const [f, setF] = useState({ id: "", outward: "+X", plane: "", u0: "", u1: "", z0: "0", z1: "", pieces: "", enclosure: "cladded", fsource: "", frev: "", encSource: "" });
  // --- declared traction form
  const [t, setT] = useState({ caseId: "", incidence: "0", source: "", revision: "", basis: "", reference: "", pressures: {} as Record<string, string> });
  // --- wind form
  const [w, setW] = useState({ a: "", b: "", h: "", longAxis: "X", v0: "", category: "II", sizeClass: "A", s3: "1", speedSource: "", speedRevision: "", speedResponsible: "", hConfirmed: false, dirs: { "+X": true, "-X": true, "+Y": true, "-Y": true } as Record<string, boolean>, cpi: "two-opposite-faces-equally-permeable", permeableAxis: "X" });
  // --- NBR 8681 form
  const cases = draft?.cases ?? [];
  const [k, setK] = useState<Record<string, { nature: string; permType: string; psiRow: string }>>({});
  const [fam, setFam] = useState({ "uls-normal": true, "sls-quasi-permanent": true, "sls-frequent": true, "sls-rare": true } as Record<string, boolean>);
  const [sets, setSets] = useState({ unfavorable: true, favorable: false });
  if (!draft) return <p>Declare o modelo físico antes de fachadas, vento e combinações.</p>;
  const cls = (id: string) => k[id] ?? { nature: "", permType: "steel-and-equipment", psiRow: "libraries-archives-warehouses-workshops-garages-roofs" };
  const classified = cases.every(c => cls(c.id).nature !== "");
  return <details className="technical-details" data-testid="normative-integration" open>
    <summary>Fachadas, vento NBR 6123 e combinações NBR 8681</summary>
    {notices.length > 0 && <div role="note" data-testid="provisional-notices">{notices.map(n => <p key={n} className="notice"><strong>{n}</strong></p>)}</div>}
    {error && <p className="field-error" role="alert" data-testid="normative-error">{error}</p>}
    {message && <p role="status" data-testid="normative-status">{message}</p>}

    <section data-testid="facade-editor"><h4>Fachadas físicas (painéis retangulares)</h4>
      <p>Cada fachada é um painel vertical retangular declarado pelo responsável, apoiado em pilares reais. O eixo horizontal local u é y, −y, −x e x para +X, −X, +Y e −Y.</p>
      {facades === null && <p role="alert">Há fachada fora do editor retangular; ela é preservada, mas não pode ser editada aqui.</p>}
      <ul>{(facades ?? []).map(x => <li key={x.id}>{x.id} · {x.outward} · u [{x.uMinMm}, {x.uMaxMm}] mm · z [{x.zMinMm}, {x.zMaxMm}] mm · pilares {x.supportPieceIds.join(", ")}
        <button className="button secondary" onClick={() => run(() => setPhysicalFacades(project, facades!.filter(y => y.id !== x.id), x.source, x.revision), "Fachada removida; a pressão anterior foi descartada.")}>Remover {x.id}</button></li>)}</ul>
      <Field label="Identificador da fachada"><Input value={f.id} onChange={e => setF({ ...f, id: e.target.value })} /></Field>
      <Field label="Orientação externa"><Select value={f.outward} onChange={e => setF({ ...f, outward: e.target.value })}>{["+X", "-X", "+Y", "-Y"].map(o => <option key={o}>{o}</option>)}</Select></Field>
      <Field label="Plano da fachada (mm)"><Input inputMode="decimal" value={f.plane} onChange={e => setF({ ...f, plane: e.target.value })} /></Field>
      <Field label="u mínimo (mm)"><Input inputMode="decimal" value={f.u0} onChange={e => setF({ ...f, u0: e.target.value })} /></Field>
      <Field label="u máximo (mm)"><Input inputMode="decimal" value={f.u1} onChange={e => setF({ ...f, u1: e.target.value })} /></Field>
      <Field label="z mínimo (mm)"><Input inputMode="decimal" value={f.z0} onChange={e => setF({ ...f, z0: e.target.value })} /></Field>
      <Field label="z máximo (mm)"><Input inputMode="decimal" value={f.z1} onChange={e => setF({ ...f, z1: e.target.value })} /></Field>
      <Field label="Pilares de apoio (IDs separados por vírgula)"><Input value={f.pieces} onChange={e => setF({ ...f, pieces: e.target.value })} /></Field>
      <Field label="Revestimento"><Select value={f.enclosure} onChange={e => setF({ ...f, enclosure: e.target.value })}>{["cladded", "partially-cladded", "open", "unknown"].map(o => <option key={o}>{o}</option>)}</Select></Field>
      <Field label="Fonte da fachada"><Input value={f.fsource} onChange={e => setF({ ...f, fsource: e.target.value })} /></Field>
      <Field label="Revisão da fachada"><Input value={f.frev} onChange={e => setF({ ...f, frev: e.target.value })} /></Field>
      <Field label="Fonte do revestimento"><Input value={f.encSource} onChange={e => setF({ ...f, encSource: e.target.value })} /></Field>
      <button className="button secondary" disabled={facades === null} onClick={() => run(() => {
        const entry = { id: f.id.trim(), outward: f.outward, planeMm: num(f.plane), uMinMm: num(f.u0), uMaxMm: num(f.u1), zMinMm: num(f.z0), zMaxMm: num(f.z1), supportPieceIds: f.pieces.split(",").map(s => s.trim()).filter(Boolean),
          enclosure: f.enclosure, enclosureSource: f.encSource, source: f.fsource, revision: f.frev } as RectangularFacadeInput;
        return setPhysicalFacades(project, [...(facades ?? []), entry], f.fsource, f.frev);
      }, "Fachada registrada e persistida no projeto.")}>Adicionar fachada</button>
    </section>

    {(facades?.length ?? 0) > 0 && <section data-testid="traction-editor"><h4>Pressão líquida de fachada declarada</h4>
      <p>Valor independente fornecido pelo responsável (positivo para dentro). O JPN não calcula Cp/Cpi aqui; veja o botão de vento NBR 6123 abaixo.</p>
      <Field label="Caso de pressão declarada"><Input value={t.caseId} onChange={e => setT({ ...t, caseId: e.target.value })} /></Field>
      <Field label="Incidência do vento (graus)"><Input inputMode="decimal" value={t.incidence} onChange={e => setT({ ...t, incidence: e.target.value })} /></Field>
      {facades!.map(x => <Field key={x.id} label={`Pressão líquida em ${x.id} (Pa)`}><Input inputMode="decimal" value={t.pressures[x.id] ?? ""} onChange={e => setT({ ...t, pressures: { ...t.pressures, [x.id]: e.target.value } })} /></Field>)}
      <Field label="Referência da hipótese"><Input value={t.reference} onChange={e => setT({ ...t, reference: e.target.value })} /></Field>
      <Field label="Fonte da pressão"><Input value={t.source} onChange={e => setT({ ...t, source: e.target.value })} /></Field>
      <Field label="Revisão da pressão"><Input value={t.revision} onChange={e => setT({ ...t, revision: e.target.value })} /></Field>
      <Field label="Base de cálculo declarada"><Input value={t.basis} onChange={e => setT({ ...t, basis: e.target.value })} /></Field>
      <button className="button secondary" onClick={() => run(() => declareFacadeTraction(project, { caseId: t.caseId.trim(), incidenceDeg: num(t.incidence), reference: t.reference, source: t.source, revision: t.revision, calculationBasis: t.basis,
        zones: facades!.map(x => ({ facadeId: x.id, netPressurePa: num(t.pressures[x.id] ?? "") })) }), "Pressão de fachada declarada registrada.")}>Registrar pressão declarada</button>
    </section>}

    {(facades?.length ?? 0) > 0 && <section data-testid="wind-nbr6123"><h4>Vento NBR 6123 nas paredes</h4>
      <p>Tabela 6 (paredes a barlavento, sotavento e paralelas) e Cpi 6.3.2/6.3.3 → pressão líquida → pilares. Resultado <strong>PROVISÓRIO</strong>: edição e licença das tabelas ainda não unificadas. Edificação retangular a × b × h com cobertura impermeável.</p>
      {[["Maior dimensão a (m)", "a"], ["Menor dimensão b (m)", "b"], ["Altura h (m)", "h"], ["V0 (m/s)", "v0"], ["S3", "s3"]].map(([l, key]) => <Field key={key} label={l}><Input inputMode="decimal" value={(w as unknown as Record<string, string>)[key]} onChange={e => setW({ ...w, [key]: e.target.value })} /></Field>)}
      <Field label="Eixo da maior dimensão"><Select value={w.longAxis} onChange={e => setW({ ...w, longAxis: e.target.value })}><option>X</option><option>Y</option></Select></Field>
      <Field label="Categoria de rugosidade"><Select value={w.category} onChange={e => setW({ ...w, category: e.target.value })}>{["I", "II", "III", "IV", "V"].map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Classe da edificação"><Select value={w.sizeClass} onChange={e => setW({ ...w, sizeClass: e.target.value })}>{["A", "B", "C"].map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Fonte de V0 e dos fatores"><Input value={w.speedSource} onChange={e => setW({ ...w, speedSource: e.target.value })} /></Field>
      <Field label="Revisão da velocidade"><Input value={w.speedRevision} onChange={e => setW({ ...w, speedRevision: e.target.value })} /></Field>
      <Field label="Responsável técnico pela velocidade"><Input value={w.speedResponsible} onChange={e => setW({ ...w, speedResponsible: e.target.value })} /></Field>
      <Field label="Regra de pressão interna"><Select value={w.cpi} onChange={e => setW({ ...w, cpi: e.target.value })}><option value="two-opposite-faces-equally-permeable">Duas faces opostas igualmente permeáveis (6.3.2.1 a)</option><option value="four-faces-equally-permeable">Quatro faces igualmente permeáveis (6.3.2.1 b)</option></Select></Field>
      {w.cpi.startsWith("two") && <Field label="Eixo das faces permeáveis"><Select value={w.permeableAxis} onChange={e => setW({ ...w, permeableAxis: e.target.value })}><option>X</option><option>Y</option></Select></Field>}
      {["+X", "-X", "+Y", "-Y"].map(d => <label key={d} className="checkbox-label"><input type="checkbox" checked={w.dirs[d]} onChange={e => setW({ ...w, dirs: { ...w.dirs, [d]: e.target.checked } })} />Vento vindo de {d}</label>)}
      <label className="checkbox-label"><input type="checkbox" checked={w.hConfirmed} onChange={e => setW({ ...w, hConfirmed: e.target.checked })} />A altura h segue o Detalhe I da Tabela 7 (solo ao beiral, beiral ≤ 0,1 b).</label>
      <button className="button" onClick={() => run(() => {
        const speed = { schema_version: "jpn.wind-speed/1", edition: NBR6123_EDITION, v0Mps: num(w.v0), heightM: num(w.h), heightReference: "model-base-z0", topography: "flat-or-gently-undulating", roughnessTransition: "none", category: w.category, sizeClass: w.sizeClass, s3: num(w.s3),
          reference: { standard: "ABNT NBR 6123", edition: NBR6123_EDITION, clause: "5", source: w.speedSource, revision: w.speedRevision, responsible: w.speedResponsible } };
        const ids = ["+X", "-X", "+Y", "-Y"].filter(d => w.dirs[d]);
        const internalPressure = w.cpi.startsWith("two") ? { rule: w.cpi, permeableAxis: w.permeableAxis } : { rule: w.cpi };
        return applyNbr6123WallWind(project, { schema_version: "jpn.nbr6123-wall-wind/2", building: { longSideM: num(w.a), shortSideM: num(w.b), heightM: num(w.h), longAxis: w.longAxis, roofImpermeable: true, heightDefinitionConfirmed: w.hConfirmed || undefined },
          speed, cases: ids.map(d => ({ id: "VENTO" + d.replace("+", "P").replace("-", "N"), windFrom: d, internalPressure })) }).project;
      }, "Vento NBR 6123 gerado, transmitido às fachadas e registrado como PROVISÓRIO.")}>Vento NBR 6123 nas paredes</button>
    </section>}

    <section data-testid="nbr8681-generator"><h4>Combinações NBR 8681</h4>
      <p>Fatores da NBR 8681:2025 (Tabelas 1–6), fonte atual = JSON público do repositório, <strong>PROVISÓRIA</strong>. Classifique cada caso; o vento em um único grupo exclusivo.</p>
      {cases.map(c => <div key={c.id} className="actions"><Field label={`Natureza do caso ${c.id}`}><Select value={cls(c.id).nature} onChange={e => setK({ ...k, [c.id]: { ...cls(c.id), nature: e.target.value } })}>
        <option value="">— classificar —</option><option value="permanent">Permanente</option><option value="variable">Variável</option><option value="wind">Vento</option></Select></Field>
        {cls(c.id).nature === "permanent" && <Field label={`Tipo da ação permanente ${c.id}`}><Select value={cls(c.id).permType} onChange={e => setK({ ...k, [c.id]: { ...cls(c.id), permType: e.target.value } })}>{permTypes.map(p => <option key={p.id} value={p.id}>{p.label.slice(0, 80)}</option>)}</Select></Field>}
        {cls(c.id).nature === "variable" && <Field label={`Fatores ψ do caso ${c.id}`}><Select value={cls(c.id).psiRow} onChange={e => setK({ ...k, [c.id]: { ...cls(c.id), psiRow: e.target.value } })}>{psiRows.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>}
      </div>)}
      {Object.keys(fam).map(x => <label key={x} className="checkbox-label"><input type="checkbox" checked={fam[x]} onChange={e => setFam({ ...fam, [x]: e.target.checked })} />Família {x}</label>)}
      <label className="checkbox-label"><input type="checkbox" checked={sets.unfavorable} onChange={e => setSets({ ...sets, unfavorable: e.target.checked })} />Permanentes desfavoráveis</label>
      <label className="checkbox-label"><input type="checkbox" checked={sets.favorable} onChange={e => setSets({ ...sets, favorable: e.target.checked })} />Permanentes favoráveis</label>
      <button className="button" disabled={!classified || cases.length === 0} onClick={() => run(() => applyNbr8681Combinations(project, {
        schema_version: "jpn.nbr8681-declaration/1", permanentMode: "separate", variableMode: "separate", permanentSets: (["unfavorable", "favorable"] as const).filter(s => sets[s]), families: Object.keys(fam).filter(x => fam[x]),
        actions: cases.map(c => { const v = cls(c.id); return v.nature === "permanent" ? { nature: "permanent", caseId: c.id, permanentType: v.permType } :
          v.nature === "wind" ? { nature: "variable", caseId: c.id, variableType: "wind", psiRow: "wind", exclusiveGroup: "VENTO" } :
          { nature: "variable", caseId: c.id, variableType: "other-and-equipment-temperature", psiRow: v.psiRow, exclusiveGroup: null }; }) }).project, "Combinações NBR 8681 geradas e registradas como PROVISÓRIAS.")}>Gerar combinações NBR 8681</button>
    </section>
  </details>;
}
