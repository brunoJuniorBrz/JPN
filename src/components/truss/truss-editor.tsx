"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Plus, Trash2, ArrowLeftRight, Check, TriangleAlert } from "lucide-react";
import { NumberField } from "@/components/number-field";
import { Field, Input, Select } from "@/components/ui";
import {
  fallPercent, purlinPositions, stations, tomTrussDefaults, trussEditorSchema, trussIssues, trussLengthMm, trussPieces, trussSummary, withFall,
  type TrussEditor as Truss,
} from "@/domain/truss-editor";
import styles from "./truss-editor.module.css";

const cm = (mm: number, digits = 1) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const m = (mm: number) => (mm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/** Campo em centímetros sobre um valor guardado em milímetros. */
function Cm({ label, mm, onMm, hint, min = 0, max = 100000 }: { label: string; mm: number; onMm: (mm: number) => void; hint?: string; min?: number; max?: number }) {
  return <NumberField label={label} hint={hint} value={Math.round(mm) / 10} min={min} max={max} decimals={1} onChange={v => { if (v !== null) onMm(Math.round(v * 10 * 10) / 10); }} />;
}

function Drawing({ t, selected, onSelect }: { t: Truss; selected: number | null; onSelect: (i: number) => void }) {
  const L = trussLengthMm(t), st = stations(t), pieces = trussPieces(t), purlins = purlinPositions(t);
  const W = 1000, padL = 70, padR = 70, sx = (W - padL - padR) / L;
  const vz = Math.min(sx * 4, 360 / t.highHeightMm), H = t.highHeightMm * vz + 150;
  const X = (s: number) => padL + s * sx, Y = (z: number) => H - 95 - z * vz;
  const panels = st.slice(1).map((s, i) => [st[i], s]);
  return <svg className={styles.drawing} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevação da tesoura (altura exagerada para leitura)">
    {pieces.filter(p => p.kind === "D").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.web} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.chord} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").filter(p => p.id.endsWith("-A") && p.b[0] < L - 1).map(p => <circle key={`e${p.id}`} cx={X(p.b[0])} cy={Y(p.b[1])} r={5} className={styles.splice}><title>Emenda do banzo</title></circle>)}
    {st.map((s, i) => <g key={s} onClick={() => onSelect(i)} className={selected === i ? styles.selected : styles.post} role="button" aria-label={`Montante ${i + 1}, ${cm(s)} cm da ponta`}>
      <line x1={X(s)} y1={Y(0)} x2={X(s)} y2={Y(st.length && t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * s / L)} />
      <rect x={X(s) - 9} y={Y(t.highHeightMm) - 10} width={18} height={Y(0) - Y(t.highHeightMm) + 20} fill="transparent" stroke="none" />
    </g>)}
    {purlins.map((p, i) => { const z = t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * p.sMm / L;
      return <rect key={i} x={X(p.sMm) - 7} y={Y(z) - 12} width={14} height={10} className={p.onNode ? styles.purlin : styles.purlinOff}><title>{p.onNode ? "Terça no nó" : "Terça fora de nó"}</title></rect>; })}
    {panels.map(([a, b], i) => (panels.length <= 12 || i % 2 === 0 || i === panels.length - 1) && <text key={a} x={X((a + b) / 2)} y={H - 58} className={styles.dim}>{cm(b - a)}</text>)}
    <line x1={X(0)} y1={H - 38} x2={X(L)} y2={H - 38} className={styles.dimLine} />
    <text x={X(L / 2)} y={H - 8} className={styles.dimStrong}>{m(L)} m de tesoura · caída {fallPercent(t).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %</text>
    <text x={X(0) - 8} y={Y(t.tipHeightMm / 2) + 9} className={styles.dimSide} textAnchor="end">{cm(t.tipHeightMm)}</text>
    <text x={X(L) + 8} y={Y(t.highHeightMm / 2) + 9} className={styles.dimSide} textAnchor="start">{cm(t.highHeightMm)}</text>
  </svg>;
}

export function TrussEditor({ initial, onApply, applyLabel }: { initial?: Truss; onApply: (t: Truss) => void; applyLabel: string }) {
  const [t, setT] = useState<Truss>(() => initial ?? tomTrussDefaults());
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const set = (patch: Partial<Truss>) => { setMessage(""); setT(prev => ({ ...prev, ...patch })); };
  const result = useMemo(() => {
    try { const parsed = trussEditorSchema.parse(t); return { s: trussSummary(parsed), issues: trussIssues(parsed), error: "" }; }
    catch (e) { return { s: null, issues: [], error: e instanceof Error ? e.message.split("\n")[0] : "Medidas inválidas." }; }
  }, [t]);
  const st = stations(t), L = trussLengthMm(t);
  const editStations = (next: number[]) => set({ stationsMm: [...new Set(next)].sort((a, b) => a - b) });
  const sel = selected !== null && selected < st.length ? selected : null;
  const errors = result.issues.filter(i => i.level === "erro");

  return <div className={styles.editor}>
    <div className={styles.canvas}>
      <Drawing t={t} selected={sel} onSelect={i => setSelected(i)} />
      <p className={styles.hint}>Toque num montante para ajustar. Altura exagerada para facilitar a leitura; as medidas são reais (em cm).</p>
      {sel !== null && <div className={styles.point}>
        <strong>Montante {sel + 1}</strong>
        <span>altura {cm(t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * st[sel] / L)} cm</span>
        {sel > 0 && sel < st.length - 1 ? <>
          <Cm label="Distância do lado alto (cm)" mm={L - st[sel]} onMm={v => { const s = L - v; if (s > st[sel - 1] && s < st[sel + 1]) { const next = [...st]; next[sel] = Math.round(s * 10) / 10; editStations(next); } }} />
          <div className={styles.row}>
            <button type="button" className="button secondary" onClick={() => { editStations(st.filter((_, i) => i !== sel)); setSelected(null); }}><Trash2 size={18} />Tirar montante</button>
          </div>
        </> : <span className={styles.muted}>Montante da {sel === 0 ? "ponta" : "lado alto"}: muda pelas medidas da tesoura.</span>}
        <div className={styles.row}>
          {sel < st.length - 1 && <button type="button" className="button secondary" onClick={() => editStations([...st, Math.round((st[sel] + st[sel + 1]) / 2 * 10) / 10])}><Plus size={18} />Montante no meio do painel ao lado</button>}
          {sel < st.length - 1 && t.diagonal !== "none" && t.diagonal !== "x" && <button type="button" className="button secondary" onClick={() => set({ flippedPanels: t.flippedPanels.includes(sel) ? t.flippedPanels.filter(i => i !== sel) : [...t.flippedPanels, sel] })}><ArrowLeftRight size={18} />Inverter diagonal deste painel</button>}
        </div>
      </div>}
    </div>

    <div className={styles.side}>
      <section className={styles.card} aria-label="Resumo">
        <h3>Resumo ao vivo</h3>
        {result.error && <p className={styles.error}>{result.error}</p>}
        {result.s && <>
          <div className={styles.kpis}>
            <div><b>{result.s.bars.chord}</b><span>barras {t.chord.designation}</span></div>
            <div><b>{t.fullHeightBudget ? result.s.bars.webFullHeight : result.s.bars.web}</b><span>barras {t.web.designation}{t.fullHeightBudget ? " (medida cheia)" : ""}</span></div>
            <div><b>{result.s.bars.purlin}</b><span>barras {t.purlin.designation}</span></div>
            <div><b>{Math.round(result.s.kg.total)} kg</b><span>{(result.s.kg.total / (t.spanMm * t.lengthMm / 1e6)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/m² de aço</span></div>
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={t.fullHeightBudget} onChange={e => set({ fullHeightBudget: e.target.checked })} /><span><strong>Orçar pela medida cheia</strong><small>Todo montante com {cm(t.highHeightMm)} cm: {result.s.bars.webFullHeight} barras (medidas reais: {result.s.bars.web}). O plano de corte sempre usa as reais.</small></span></label>
          <table className={styles.budget}><tbody>
            {result.s.lines.map(l => <tr key={l.item}><td>{l.item}</td><td>{l.qty}</td><td>{l.cents === null ? <em>a informar</em> : brl(l.cents)}</td></tr>)}
            <tr className={styles.total}><td>Total conhecido</td><td></td><td>{brl(result.s.knownCents)}</td></tr>
          </tbody></table>
          {result.s.missing.length > 0 && <p className={styles.muted}>Sem preço: {result.s.missing.join(", ")}.</p>}
        </>}
        {result.issues.map(i => <p key={i.message} className={i.level === "erro" ? styles.error : styles.warn}><TriangleAlert size={15} />{i.message}</p>)}
        <div className={styles.actions}>
          <button type="button" className="button" disabled={!!result.error || errors.length > 0} onClick={() => { try { onApply(trussEditorSchema.parse(t)); setMessage("Aplicado. 3D, CAD, materiais e plano de corte usam esta tesoura."); } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível aplicar."); } }}><Check size={18} />{applyLabel}</button>
          <button type="button" className="button secondary" onClick={() => { setT(tomTrussDefaults()); setSelected(null); }}><RotateCcw size={18} />Voltar ao padrão</button>
        </div>
        {message && <p className={styles.ok} role="status">{message}</p>}
      </section>

      <section className={styles.card}>
        <h3>Obra</h3>
        <div className={styles.grid}>
          <Cm label="Muro a muro (cm)" mm={t.spanMm} onMm={spanMm => set({ spanMm, stationsMm: null })} min={100} />
          <Cm label="Comprimento (cm)" mm={t.lengthMm} onMm={lengthMm => set({ lengthMm })} min={100} />
          <NumberField label="Tesouras" value={t.trusses} min={2} max={60} decimals={0} onChange={v => v !== null && set({ trusses: v })} hint={`A cada ${m(t.lengthMm / (t.trusses - 1))} m`} />
        </div>
      </section>
      <section className={styles.card}>
        <h3>Calha e ponta baixa</h3>
        <div className={styles.grid}>
          <Cm label="Apoio da calha no muro (cm)" mm={t.gutter.supportMm} onMm={v => set({ gutter: { ...t.gutter, supportMm: v }, stationsMm: null })} />
          <Cm label="Largura da calha (cm)" mm={t.gutter.widthMm} onMm={v => set({ gutter: { ...t.gutter, widthMm: v }, stationsMm: null })} />
          <Cm label="Da calha até a ponta (cm)" mm={t.gutter.clearanceMm} onMm={v => set({ gutter: { ...t.gutter, clearanceMm: v }, stationsMm: null })} />
        </div>
      </section>
      <section className={styles.card}>
        <h3>Tesoura</h3>
        <div className={styles.grid}>
          <Cm label="Altura na ponta (cm)" mm={t.tipHeightMm} onMm={tipHeightMm => set({ tipHeightMm })} min={0.1} />
          <Cm label="Altura no lado alto (cm)" mm={t.highHeightMm} onMm={highHeightMm => set({ highHeightMm })} min={0.1} />
          <NumberField label="Caída (%)" value={Math.round(fallPercent(t) * 100) / 100} min={0.5} max={60} decimals={2} onChange={v => v !== null && setT(prev => withFall(prev, v))} hint="Muda a altura do lado alto." />
          <Cm label="Painel (cm)" mm={t.panelMm} onMm={panelMm => set({ panelMm, stationsMm: null, flippedPanels: [] })} min={10} />
          <Field label="Contar painéis a partir"><Select value={t.countFrom} onChange={e => set({ countFrom: e.target.value as Truss["countFrom"], stationsMm: null, flippedPanels: [] })}><option value="high">do lado alto (sobra na ponta)</option><option value="low">da ponta (sobra no alto)</option></Select></Field>
          <Field label="Diagonais"><Select value={t.diagonal} onChange={e => set({ diagonal: e.target.value as Truss["diagonal"], flippedPanels: [] })}><option value="to-high">subindo para o lado alto</option><option value="to-low">subindo para a ponta</option><option value="x">em X</option><option value="none">sem diagonal</option></Select></Field>
          <Cm label="Emenda do banzo a partir da ponta (cm)" mm={t.chordSpliceMm} onMm={chordSpliceMm => set({ chordSpliceMm })} min={50} />
        </div>
        {t.stationsMm && <button type="button" className="button secondary" onClick={() => set({ stationsMm: null, flippedPanels: [] })}><RotateCcw size={16} />Desfazer ajustes ponto a ponto ({st.length} montantes)</button>}
      </section>
      <section className={styles.card}>
        <h3>Terças</h3>
        <div className={styles.grid}>
          <NumberField label="Linhas de terça" value={t.purlinLines} min={2} max={60} decimals={0} onChange={v => v !== null && set({ purlinLines: v })} />
          <Cm label="Espaço a partir do lado alto (cm)" mm={t.purlinStepMm} onMm={purlinStepMm => set({ purlinStepMm })} min={30} hint="A última terça fica na ponta." />
        </div>
      </section>
      <section className={styles.card}>
        <h3>Perfis e preços</h3>
        {(["chord", "web", "purlin"] as const).map(k => <div key={k} className={styles.grid}>
          <Field label={k === "chord" ? "Banzos" : k === "web" ? "Montantes e diagonais" : "Terças"}><Input value={t[k].designation} onChange={e => set({ [k]: { ...t[k], designation: e.target.value } } as Partial<Truss>)} /></Field>
          <NumberField label="kg/m" value={t[k].kgPerM} min={0.01} max={1000} decimals={3} onChange={v => v !== null && set({ [k]: { ...t[k], kgPerM: v } } as Partial<Truss>)} />
          <NumberField label="Preço da barra (R$)" money value={t[k].barPriceCents} min={0} max={1000000} decimals={2} onChange={v => set({ [k]: { ...t[k], barPriceCents: v } } as Partial<Truss>)} />
        </div>)}
        <Cm label="Barra comercial (cm)" mm={t.stockMm} onMm={stockMm => set({ stockMm })} min={100} />
      </section>
      <section className={styles.card}>
        <h3>Telha e serviço</h3>
        <div className={styles.grid}>
          <Cm label="Largura útil da telha (cm)" mm={t.sheet.usefulWidthMm} onMm={v => set({ sheet: { ...t.sheet, usefulWidthMm: v } })} min={30} />
          <Cm label="Telha além da ponta (cm)" mm={t.sheet.beyondTipMm} onMm={v => set({ sheet: { ...t.sheet, beyondTipMm: v } })} hint="Até dentro da calha." />
          <NumberField label="Telha R$/m" money value={t.sheet.pricePerMCents} min={0} max={100000} decimals={2} onChange={v => set({ sheet: { ...t.sheet, pricePerMCents: v } })} />
          <NumberField label="Mão de obra R$/m²" money value={t.laborPerM2Cents} min={0} max={1000000} decimals={2} onChange={v => set({ laborPerM2Cents: v })} />
          <NumberField label="Insumos (R$)" money value={t.consumablesCents} min={0} max={10000000} decimals={2} onChange={v => set({ consumablesCents: v })} />
          <NumberField label="Parafuso (R$/un)" money value={t.screwPriceCents} min={0} max={1000} decimals={2} onChange={v => set({ screwPriceCents: v })} />
        </div>
      </section>
      <p className={styles.notice}>Estudo de conferência: sem cálculo de cargas, vento, perfis ou ligações. Fabricação bloqueada até conferência de engenheiro.</p>
    </div>
  </div>;
}
