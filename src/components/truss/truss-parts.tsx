"use client";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowLeftRight, Minus, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { NumberField } from "@/components/number-field";
import { Field, Input, Select } from "@/components/ui";
import {
  COMMON_PROFILES, fallPercent, roofPurlinPositions, slopeCount, stations, tipOffsetMm, trussEditorSchema, trussIssues, trussLengthMm, trussPiecesComplete, trussSummary, withFall,
  type TrussEditor as Truss,
} from "@/domain/truss-editor";
import styles from "./truss-studio.module.css";

const cm = (mm: number, digits = 1) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const m = (mm: number) => (mm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/** Resumo calculado de um rascunho; nunca lança (rascunho pode estar no meio da digitação). */
export function useTrussResult(t: Truss) {
  return useMemo(() => {
    try { const parsed = trussEditorSchema.parse(t); return { s: trussSummary(parsed), issues: trussIssues(parsed), error: "" }; }
    catch (e) { return { s: null, issues: [], error: e instanceof Error ? e.message.split("\n")[0] : "Medidas inválidas." }; }
  }, [t]);
}

/** Estação (índice a partir da ponta) de uma peça do 3D: T#-M#, T#-D#, T#-E-M#, T#-D-M#, T#-E-D#a… */
export function stationFromPieceId(id: string): number | null {
  const match = /^T\d+-(?:(?:E|D)-)?([MD])(\d+)[ab]?$/.exec(id);
  if (!match) return null;
  const n = Number(match[2]);
  return match[1] === "M" ? n - 1 : n - 1; // diagonal D# começa na estação # (painel #)
}
/** Peça do 3D para uma estação, em cada tesoura (a seleção vale para todas, mesmo tipo). */
export function pieceIdsForStation(t: Truss, station: number) {
  const prefix = slopeCount(t) === 2 ? "E-" : "";
  return Array.from({ length: t.trusses }, (_, f) => `T${f + 1}-${prefix}M${station + 1}`);
}

type Drag = { kind: "station"; index: number } | { kind: "tip" } | { kind: "high" };

/**
 * Elevação interativa (F: tesoura ao vivo). Toque/clique seleciona um montante; arrastar um montante
 * interno muda a posição (snap 1 cm; Shift ou dois dedos = 5 cm); arrastar o nó da ponta ou do alto/cumeeira
 * muda a altura. A cota aparece durante o arraste. Os campos numéricos continuam sendo a fonte exata.
 */
export function TrussDrawing({ t, selected, hovered, onSelect, onHover, onChange }: {
  t: Truss; selected: number | null; hovered: number | null; onSelect: (i: number | null) => void; onHover: (i: number | null) => void;
  onChange: (patch: Partial<Truss>) => void;
}) {
  const svg = useRef<SVGSVGElement>(null), touches = useRef(new Set<number>());
  const [drag, setDrag] = useState<(Drag & { label: string; x: number; y: number }) | null>(null);
  const L = trussLengthMm(t), S = slopeCount(t), st = stations(t), pieces = trussPiecesComplete(t), purlins = roofPurlinPositions(t), off = tipOffsetMm(t);
  const th = t.walls.thicknessMm, sMin = -off - th, sMax = L * S + th;
  const W = 1000, padL = 46, padR = 46, sx = (W - padL - padR) / (sMax - sMin);
  const vz = Math.min(sx * 4, 330 / Math.max(t.highHeightMm, 1)), stub = 90;
  const top = 46, H = top + t.highHeightMm * vz + stub + 70;
  const X = (s: number) => padL + (s - sMin) * sx, base = top + t.highHeightMm * vz, Y = (z: number) => base - z * vz;
  const height = (s: number) => t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * Math.min(s, 2 * L - s) / L;
  const local = (e: ReactPointerEvent) => {
    const el = svg.current!, p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(el.getScreenCTM()!.inverse());
  };
  const start = (e: ReactPointerEvent, d: Drag) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); touches.current.add(e.pointerId);
    if (d.kind === "station") onSelect(d.index);
    setDrag({ ...d, label: "", x: 0, y: 0 });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = local(e), snap = e.shiftKey || touches.current.size > 1 ? 50 : 10;
    if (drag.kind === "station") {
      const raw = (p.x - padL) / sx + sMin, lo = st[drag.index - 1] + snap, hi = st[drag.index + 1] - snap;
      const s = Math.min(hi, Math.max(lo, Math.round(raw / snap) * snap));
      if (s !== st[drag.index]) { const next = [...st]; next[drag.index] = s; onChange({ stationsMm: next }); }
      setDrag({ ...drag, label: `${cm(s)} cm da ponta`, x: X(s), y: Y(height(s)) - 16 });
    } else {
      const z = Math.round(((base - p.y) / vz) / snap) * snap;
      if (drag.kind === "tip") { const v = Math.max(10, Math.min(t.highHeightMm - 10, z)); if (v !== t.tipHeightMm) onChange({ tipHeightMm: v }); setDrag({ ...drag, label: `ponta ${cm(v)} cm`, x: X(0), y: Y(v) - 16 }); }
      else { const v = Math.max(t.tipHeightMm + 10, Math.min(10000, z)); if (v !== t.highHeightMm) onChange({ highHeightMm: v }); setDrag({ ...drag, label: `${S === 2 ? "cumeeira" : "alto"} ${cm(v)} cm`, x: X(L), y: Y(Math.min(v, t.highHeightMm)) - 16 }); }
    }
  };
  const end = (e: ReactPointerEvent) => { touches.current.delete(e.pointerId); setDrag(null); };
  return <svg ref={svg} className={styles.drawing} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Elevação da tesoura (altura exagerada para leitura; medidas reais em cm)" data-testid="truss-drawing"
    onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={() => onSelect(null)}>
    <rect x={X(sMin)} y={Y(Math.min(t.highHeightMm, 150 / vz))} width={th * sx} height={base + stub - Y(Math.min(t.highHeightMm, 150 / vz))} className={styles.wall}><title>Muro {cm(t.walls.lowMm)} cm (contexto visual)</title></rect>
    <rect x={X(L * S)} y={Y(Math.min(t.highHeightMm, 150 / vz))} width={th * sx} height={base + stub - Y(Math.min(t.highHeightMm, 150 / vz))} className={styles.wall}><title>Muro (contexto visual)</title></rect>
    {pieces.filter(p => p.kind === "D").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.web} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.chord} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").filter(p => p.b[0] < L * S - 1 && p.b[0] > 1).map(p => <circle key={`e${p.id}`} cx={X(p.b[0])} cy={Y(p.b[1])} r={5} className={styles.splice}><title>Emenda do banzo</title></circle>)}
    {purlins.map((p, i) => <rect key={i} x={X(p.xMm) - 7} y={Y(height(p.xMm)) - 12} width={14} height={10} className={p.onNode ? styles.purlin : styles.purlinOff}><title>{p.onNode ? "Terça no nó" : "Terça fora de nó"}</title></rect>)}
    {st.map((s, i) => {
      const inner = i > 0 && i < st.length - 1, cls = [styles.post, selected === i && styles.selected, hovered === i && styles.hovered].filter(Boolean).join(" ");
      return <g key={i} tabIndex={0} role="button" className={cls} data-station={i} aria-pressed={selected === i}
        aria-label={`Montante ${i + 1}, ${cm(s)} cm da ponta, altura ${cm(height(s))} cm${inner ? ". Arraste na horizontal para mover." : ""}`}
        onClick={e => { e.stopPropagation(); onSelect(i); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } }}
        onPointerEnter={() => onHover(i)} onPointerLeave={() => onHover(null)} onPointerDown={inner ? e => start(e, { kind: "station", index: i }) : undefined}>
        <line x1={X(s)} y1={Y(0)} x2={X(s)} y2={Y(height(s))} />
        <rect x={X(s) - 11} y={Y(t.highHeightMm) - 10} width={22} height={Y(0) - Y(t.highHeightMm) + 20} fill="transparent" stroke="none" />
      </g>;
    })}
    <circle cx={X(0)} cy={Y(t.tipHeightMm)} r={9} className={styles.handle} data-handle="tip" role="slider" tabIndex={0} aria-label="Altura na ponta: arraste na vertical" aria-valuenow={t.tipHeightMm / 10} aria-valuetext={`${cm(t.tipHeightMm)} cm`}
      onPointerDown={e => start(e, { kind: "tip" })} onClick={e => e.stopPropagation()} />
    <circle cx={X(L)} cy={Y(t.highHeightMm)} r={9} className={styles.handle} data-handle="high" role="slider" tabIndex={0} aria-label={`Altura ${S === 2 ? "na cumeeira" : "no lado alto"}: arraste na vertical`} aria-valuenow={t.highHeightMm / 10} aria-valuetext={`${cm(t.highHeightMm)} cm`}
      onPointerDown={e => start(e, { kind: "high" })} onClick={e => e.stopPropagation()} />
    <text x={X(0) + 12} y={Y(t.tipHeightMm) - 12} className={styles.dimSide} textAnchor="start">{cm(t.tipHeightMm)}</text>
    <text x={X(L) - 14} y={Y(t.highHeightMm) - 14} className={styles.dimSide} textAnchor="end">{cm(t.highHeightMm)}{S === 2 ? " cumeeira" : ""}</text>
    <line x1={X(0)} y1={H - 30} x2={X(L * S)} y2={H - 30} className={styles.dimLine} />
    <text x={X(L * S / 2)} y={H - 8} className={styles.dimStrong}>{m(L * S)} m · {S} água(s) · caída {fallPercent(t).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %</text>
    {drag?.label && <g className={styles.live} data-testid="truss-live-dimension"><rect x={drag.x - 70} y={drag.y - 20} width={140} height={24} rx={6} /><text x={drag.x} y={drag.y - 3} textAnchor="middle">{drag.label}</text></g>}
  </svg>;
}

/** KPIs da tesoura: barras por perfil, kg, telhas e total conhecido. */
export function TrussSummaryChips({ t, compact = false }: { t: Truss; compact?: boolean }) {
  const r = useTrussResult(t);
  if (!r.s) return <p className={styles.error} role="status">{r.error || "Medidas incompletas."}</p>;
  const sheets = r.s.lines.find(l => /telha/i.test(l.item));
  return <div className={compact ? `${styles.chips} ${styles.chipsCompact}` : styles.chips} data-testid="truss-summary-chips" aria-label="Resumo da tesoura">
    <span><b>{r.s.buy.chord}</b> barras {t.chord.designation.split(" ")[0]}</span>
    <span><b>{r.s.buy.web}</b> barras {t.web.designation.split(" ")[0]}</span>
    <span><b>{r.s.buy.purlin}</b> barras {t.purlin.designation.split(" ")[0]}</span>
    <span><b>{Math.round(r.s.kg.total)}</b> kg</span>
    {sheets && <span><b>{sheets.qty}</b> telhas</span>}
    <span><b>{brl(r.s.knownCents)}</b> conhecido</span>
  </div>;
}

/** Campo em cm sobre mm, com botões −/+ de 1 cm (alvos de toque no celular). */
function Cm({ label, mm, onMm, hint, min = 0, max = 100000 }: { label: string; mm: number; onMm: (mm: number) => void; hint?: string; min?: number; max?: number }) {
  const step = (d: number) => onMm(Math.min(max * 10, Math.max(min * 10, Math.round(mm + d))));
  return <div className={styles.stepper}>
    <NumberField label={label} hint={hint} value={Math.round(mm) / 10} min={min} max={max} decimals={1} onChange={v => { if (v !== null) onMm(Math.round(v * 10 * 10) / 10); }} />
    <div className={styles.stepButtons}>
      <button type="button" aria-label={`Diminuir ${label} em 1 cm`} onClick={() => step(-10)}><Minus size={16} aria-hidden="true" /></button>
      <button type="button" aria-label={`Aumentar ${label} em 1 cm`} onClick={() => step(10)}><Plus size={16} aria-hidden="true" /></button>
    </div>
  </div>;
}

export const trussSections = [
  { id: "obra", label: "Obra" }, { id: "calha", label: "Calha" }, { id: "tesoura", label: "Tesoura" }, { id: "tercas", label: "Terças" },
  { id: "perfis", label: "Perfis e preços" }, { id: "telha", label: "Telha e serviço" }, { id: "ancoragem", label: "Ancoragem" },
] as const;
export type TrussSectionId = (typeof trussSections)[number]["id"];

/** Painel do montante selecionado (2D ou 3D): posição, remover, dividir painel, inverter diagonal. */
export function TrussPointPanel({ t, index, set, onClear }: { t: Truss; index: number; set: (p: Partial<Truss>) => void; onClear: () => void }) {
  const st = stations(t), L = trussLengthMm(t), inner = index > 0 && index < st.length - 1;
  const edit = (next: number[]) => set({ stationsMm: [...new Set(next)].sort((a, b) => a - b) });
  return <section className={styles.point} aria-label={`Montante ${index + 1}`} data-testid="truss-point-panel">
    <header><strong>Montante {index + 1}</strong><span>{cm(st[index])} cm da ponta · altura {cm(t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * st[index] / L)} cm</span>
      <button type="button" className={styles.linkButton} onClick={onClear}>Fechar</button></header>
    {inner ? <>
      <Cm label="Distância da ponta (cm)" mm={st[index]} onMm={v => { if (v > st[index - 1] && v < st[index + 1]) { const next = [...st]; next[index] = v; edit(next); } }} />
      <div className={styles.row}>
        <button type="button" className="button secondary" onClick={() => { edit(st.filter((_, i) => i !== index)); onClear(); }}><Trash2 size={16} aria-hidden="true" />Tirar montante</button>
      </div>
    </> : <p className={styles.muted}>Montante da {index === 0 ? "ponta" : S(t) === 2 ? "cumeeira" : "lado alto"}: muda pelas alturas da tesoura.</p>}
    <div className={styles.row}>
      {index < st.length - 1 && <button type="button" className="button secondary" onClick={() => edit([...st, Math.round((st[index] + st[index + 1]) / 2)])}><Plus size={16} aria-hidden="true" />Montante no meio do painel</button>}
      {index < st.length - 1 && t.diagonal !== "none" && t.diagonal !== "x" && <button type="button" className="button secondary" onClick={() => set({ flippedPanels: t.flippedPanels.includes(index) ? t.flippedPanels.filter(i => i !== index) : [...t.flippedPanels, index] })}><ArrowLeftRight size={16} aria-hidden="true" />Inverter diagonal</button>}
    </div>
  </section>;
}
const S = (t: Truss) => slopeCount(t);

/** Formulário em seções recolhíveis (uma aberta por vez); no celular as seções viram abas. */
export function TrussForm({ t, set, setT, open, onOpen }: { t: Truss; set: (p: Partial<Truss>) => void; setT: (f: (prev: Truss) => Truss) => void; open: TrussSectionId; onOpen: (id: TrussSectionId) => void }) {
  const r = useTrussResult(t), st = stations(t);
  const section = (id: TrussSectionId, body: ReactNode) => <details className={styles.section} open={open === id} data-section={id}
    onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && open !== id) onOpen(id); }}>
    <summary onClick={e => { e.preventDefault(); onOpen(id); }}>{trussSections.find(s => s.id === id)!.label}</summary>
    <div className={styles.grid}>{body}</div>
  </details>;
  return <div className={styles.form} data-testid="truss-form">
    <div className={styles.tabs} role="tablist" aria-label="Seções da tesoura">{trussSections.map(s => <button key={s.id} type="button" role="tab" aria-selected={open === s.id} onClick={() => onOpen(s.id)}>{s.label}</button>)}</div>
    {r.issues.map(i => <p key={i.message} className={i.level === "erro" ? styles.error : styles.warn}><TriangleAlert size={15} aria-hidden="true" />{i.message}</p>)}
    {section("obra", <>
      <Field label="Tipo de cobertura"><Select value={t.roofKind} onChange={e => {
        const kind = e.target.value as Truss["roofKind"], off = tipOffsetMm(t);
        const run = (t.spanMm - (kind === "two-slopes" ? 2 : 1) * off) / (kind === "two-slopes" ? 2 : 1);
        const step = Math.max(300, Math.floor(run / (t.purlinLines - 1) / 10) * 10);
        const highHeightMm = Math.round((t.tipHeightMm + run * fallPercent(t) / 100) * 10) / 10;
        set({ roofKind: kind, highHeightMm, purlinStepMm: Math.min(t.purlinStepMm, step), stationsMm: null, flippedPanels: [] });
      }}><option value="one-slope">Uma água</option><option value="two-slopes">Duas águas simétricas</option></Select></Field>
      <Cm label="Muro a muro (cm)" mm={t.spanMm} onMm={spanMm => set({ spanMm, stationsMm: null })} min={100} />
      <Cm label="Comprimento (cm)" mm={t.lengthMm} onMm={lengthMm => set({ lengthMm })} min={100} />
      <Cm label="Altura do muro baixo (cm)" mm={t.walls.lowMm} onMm={v => set({ walls: { ...t.walls, lowMm: v } })} />
      {t.roofKind === "one-slope" && <Cm label="Altura do muro alto (cm)" mm={t.walls.highMm} onMm={v => set({ walls: { ...t.walls, highMm: v } })} />}
      <Cm label="Espessura do muro (cm)" mm={t.walls.thicknessMm} onMm={v => set({ walls: { ...t.walls, thicknessMm: v } })} min={5} />
      <Cm label="Banzo de baixo a partir do piso (cm)" mm={t.supportZMm} onMm={supportZMm => set({ supportZMm })} />
      <NumberField label="Tesouras" value={t.trusses} min={2} max={60} decimals={0} onChange={v => v !== null && set({ trusses: v })} hint={`A cada ${m(t.lengthMm / (t.trusses - 1))} m`} />
    </>)}
    {section("calha", <>
      <Cm label="Apoio da calha no muro (cm)" mm={t.gutter.supportMm} onMm={v => set({ gutter: { ...t.gutter, supportMm: v }, stationsMm: null })} />
      <Cm label="Largura da calha (cm)" mm={t.gutter.widthMm} onMm={v => set({ gutter: { ...t.gutter, widthMm: v }, stationsMm: null })} />
      <Cm label="Da calha até a ponta (cm)" mm={t.gutter.clearanceMm} onMm={v => set({ gutter: { ...t.gutter, clearanceMm: v }, stationsMm: null })} />
      <Cm label="Lado menor da calha (cm)" mm={t.gutter.lowSideMm} onMm={v => set({ gutter: { ...t.gutter, lowSideMm: v } })} />
      <Cm label="Lado maior da calha (cm)" mm={t.gutter.highSideMm} onMm={v => set({ gutter: { ...t.gutter, highSideMm: v } })} />
      <label className={styles.toggle}><input type="checkbox" checked={t.gutter.budgeted} onChange={e => set({ gutter: { ...t.gutter, budgeted: e.target.checked } })} /><span>Calha entra no orçamento</span></label>
      {t.gutter.budgeted && <NumberField label="Calha (R$/metro)" money value={t.gutter.pricePerMCents} min={0} max={100000} decimals={2} onChange={v => set({ gutter: { ...t.gutter, pricePerMCents: v } })} />}
    </>)}
    {section("tesoura", <>
      <Cm label="Altura na ponta (cm)" mm={t.tipHeightMm} onMm={tipHeightMm => set({ tipHeightMm })} min={0.1} />
      <Cm label={t.roofKind === "two-slopes" ? "Altura na cumeeira (cm)" : "Altura no lado alto (cm)"} mm={t.highHeightMm} onMm={highHeightMm => set({ highHeightMm })} min={0.1} />
      <NumberField label="Caída (%)" value={Math.round(fallPercent(t) * 100) / 100} min={0.5} max={60} decimals={2} onChange={v => v !== null && setT(prev => withFall(prev, v))} />
      <Cm label="Painel (cm)" mm={t.panelMm} onMm={panelMm => set({ panelMm, stationsMm: null, flippedPanels: [] })} min={10} />
      <Field label="Contar painéis a partir"><Select value={t.countFrom} onChange={e => set({ countFrom: e.target.value as Truss["countFrom"], stationsMm: null, flippedPanels: [] })}><option value="high">do lado alto (sobra na ponta)</option><option value="low">da ponta (sobra no alto)</option></Select></Field>
      <Field label="Diagonais"><Select value={t.diagonal} onChange={e => set({ diagonal: e.target.value as Truss["diagonal"], flippedPanels: [] })}><option value="to-high">subindo para o lado alto</option><option value="to-low">subindo para a ponta</option><option value="x">em X</option><option value="none">sem diagonal</option></Select></Field>
      <Cm label="Emenda do banzo a partir da ponta (cm)" mm={t.chordSpliceMm} onMm={chordSpliceMm => set({ chordSpliceMm })} min={50} />
      {t.roofKind === "two-slopes" && <Field label="Banzo inferior" hint="Questão de fabricação em aberto: confirme com o engenheiro."><Select value={t.bottomChord} onChange={e => set({ bottomChord: e.target.value as Truss["bottomChord"] })}><option value="continuous">contínuo com emenda</option><option value="split">dividido na cumeeira</option></Select></Field>}
      {t.stationsMm && <button type="button" className="button secondary" onClick={() => set({ stationsMm: null, flippedPanels: [] })}><RotateCcw size={16} aria-hidden="true" />Desfazer ajustes ponto a ponto ({st.length} montantes)</button>}
    </>)}
    {section("tercas", <>
      <NumberField label={t.roofKind === "two-slopes" ? "Linhas de terça por água" : "Linhas de terça"} value={t.purlinLines} min={2} max={60} decimals={0} onChange={v => v !== null && set({ purlinLines: v })} />
      <Cm label={t.roofKind === "two-slopes" ? "Espaço a partir da cumeeira (cm)" : "Espaço a partir do lado alto (cm)"} mm={t.purlinStepMm} onMm={purlinStepMm => set({ purlinStepMm })} min={30} />
    </>)}
    {section("perfis", <>
      {(["chord", "web", "purlin"] as const).map(k => <div key={k} className={styles.profile}>
        <Field label={`${k === "chord" ? "Banzos" : k === "web" ? "Montantes e diagonais" : "Terças"}: escolher`}><Select value={COMMON_PROFILES.some(p => p.designation === t[k].designation) ? t[k].designation : ""} onChange={e => { const p = COMMON_PROFILES.find(x => x.designation === e.target.value); if (p) set({ [k]: { ...t[k], designation: p.designation, kgPerM: p.kgPerM } } as Partial<Truss>); }}>
          <option value="">outro (digitar)</option>
          {COMMON_PROFILES.map(p => <option key={p.designation} value={p.designation}>{p.designation} · {p.kgPerM.toLocaleString("pt-BR")} kg/m</option>)}
        </Select></Field>
        <Field label="Nome do perfil"><Input value={t[k].designation} onChange={e => set({ [k]: { ...t[k], designation: e.target.value } } as Partial<Truss>)} /></Field>
        <NumberField label="kg/m" value={t[k].kgPerM} min={0.01} max={1000} decimals={3} onChange={v => v !== null && set({ [k]: { ...t[k], kgPerM: v } } as Partial<Truss>)} />
        <NumberField label="Preço da barra (R$)" money value={t[k].barPriceCents} min={0} max={1000000} decimals={2} onChange={v => set({ [k]: { ...t[k], barPriceCents: v } } as Partial<Truss>)} />
      </div>)}
      <Cm label="Barra comercial (cm)" mm={t.stockMm} onMm={stockMm => set({ stockMm })} min={100} />
    </>)}
    {section("telha", <>
      <Cm label="Largura útil da telha (cm)" mm={t.sheet.usefulWidthMm} onMm={v => set({ sheet: { ...t.sheet, usefulWidthMm: v } })} min={30} />
      <Cm label="Telha além da ponta (cm)" mm={t.sheet.beyondTipMm} onMm={v => set({ sheet: { ...t.sheet, beyondTipMm: v } })} />
      <NumberField label="Peças de telha por água" value={t.sheet.piecesPerSlope} min={1} max={6} decimals={0} onChange={v => v !== null && set({ sheet: { ...t.sheet, piecesPerSlope: v } })} />
      <NumberField label="Telha R$/m" money value={t.sheet.pricePerMCents} min={0} max={100000} decimals={2} onChange={v => set({ sheet: { ...t.sheet, pricePerMCents: v } })} />
      <NumberField label="Mão de obra R$/m²" money value={t.laborPerM2Cents} min={0} max={1000000} decimals={2} onChange={v => set({ laborPerM2Cents: v })} />
    </>)}
    {section("ancoragem", <>
      <Cm label="Chapa largura (cm)" mm={t.anchor.plateWidthMm} onMm={v => set({ anchor: { ...t.anchor, plateWidthMm: v } })} />
      <Cm label="Chapa altura (cm)" mm={t.anchor.plateHeightMm} onMm={v => set({ anchor: { ...t.anchor, plateHeightMm: v } })} />
      <NumberField label="Chumbadores por apoio" value={t.anchor.boltsPerSupport} min={0} max={20} decimals={0} onChange={v => v !== null && set({ anchor: { ...t.anchor, boltsPerSupport: v } })} />
      <Cm label="Comprimento do chumbador (cm)" mm={t.anchor.boltLengthMm} onMm={v => set({ anchor: { ...t.anchor, boltLengthMm: v } })} />
      <p className={styles.muted}>Chapas e chumbadores são só posições declaradas: sem ligação, rigidez ou capacidade verificada.</p>
    </>)}
  </div>;
}
