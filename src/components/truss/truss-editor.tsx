"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Plus, Trash2, ArrowLeftRight, Check, TriangleAlert, FilePlus2 } from "lucide-react";
import { NumberField } from "@/components/number-field";
import { Field, Input, Select } from "@/components/ui";
import {
  BASE_TYPE, TYPE_KEYS, addTrussType, gableCount, steelTrussLines, lineTypeId, removeTrussType, trussOfType, typeName,
  blankTruss, COMMON_PROFILES, columnCount, endSupportOf, trussEnds, wallPlateCount, withEndSupports, type EndSupport, type TrussSide, fallPercent, fitPurlins, roofPurlinPositions, slopeCount, stations, suggestedTrussCount, tipOffsetMm, tomTrussDefaults, trussEditorSchema, trussIssues, trussLengthMm, trussPiecesComplete, trussSummary, withFall,
  type TrussEditor as Truss,
} from "@/domain/truss-editor";
import styles from "./truss-editor.module.css";

const cm = (mm: number, digits = 1) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const m = (mm: number) => (mm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/** Reorganização geométrica ao mudar o vão, calha ou número de águas; não escolhe apoios. */
function reflowTruss(t: Truss, patch: Partial<Pick<Truss, "spanMm" | "roofKind" | "gutter" | "support">>): Partial<Truss> {
  const candidate: Truss = { ...t, ...patch }, runMm = trussLengthMm(candidate);
  if (!(runMm > 0) || !Number.isFinite(runMm)) return { ...patch, stationsMm: null, flippedPanels: [], types: t.types.map(x => ({ ...x, stationsMm: null, flippedPanels: [] })) };
  const { purlinLines, purlinStepMm } = fitPurlins({ ...candidate, stationsMm: null }, runMm, t.purlinStepMm);
  return { ...patch, highHeightMm: Math.round((t.tipHeightMm + runMm * fallPercent(t) / 100) * 10) / 10,
    purlinLines, purlinStepMm, stationsMm: null, flippedPanels: [],
    types: t.types.map(x => ({ ...x, stationsMm: null, flippedPanels: [] })) };
}

type Summary = ReturnType<typeof trussSummary>;
/** Só a exibição: o texto guardado da lista (gabarito de obras antigas) continua o mesmo. */
const readableQty = (q: string) => q.replace("1 água(s)", "1 água").replace(/(\d+) água\(s\)/, "$1 águas")
  .replace(/\b1 peça\(s\)\/água/, "1 peça por água").replace(/(\d+) peça\(s\)\/água/, "$1 peças por água");
function BudgetTable({ s }: { s: Summary }) {
  return <table className={styles.budget}><tbody>
    {s.lines.map(l => <tr key={l.item}><td>{l.item}</td><td>{readableQty(l.qty)}</td><td>{l.cents === null ? <em>a informar</em> : brl(l.cents)}</td></tr>)}
    <tr className={styles.total}><td>Total conhecido</td><td></td><td>{brl(s.knownCents)}</td></tr>
  </tbody></table>;
}

/** Lista de materiais da obra, a mesma do "Resumo ao vivo" do editor, para a etapa Materiais do projeto. */
export function TrussMaterialList({ truss }: { truss: Truss }) {
  const s = useMemo(() => { try { return trussSummary(trussEditorSchema.parse(truss)); } catch { return null; } }, [truss]);
  if (!s) return <p className="notice">Não foi possível montar a lista desta tesoura. Abra a etapa Tesoura e confira as medidas.</p>;
  const area = truss.spanMm * truss.lengthMm / 1e6;
  return <section className={styles.card} aria-label="Lista de materiais" data-testid="truss-material-list">
    <h3>Lista de materiais</h3>
    <p className={styles.muted}>A mesma lista do editor de tesoura: barras de {m(truss.stockMm)} m, quantidades para compra.</p>
    <div className={styles.kpis}>
      <div><b>{s.buy.chord}</b><span>barras de banzo</span></div>
      <div><b>{s.buy.web}</b><span>barras {truss.web.designation}{truss.fullHeightBudget ? " (medida cheia)" : ""}</span></div>
      <div><b>{s.buy.purlin}</b><span>barras {truss.purlin.designation}</span></div>
      <div><b>{Math.round(s.kg.total)} kg</b><span>{(s.kg.total / area).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/m² de aço</span></div>
    </div>
    <BudgetTable s={s} />
    <p className={styles.muted}>{s.gutterLine}.</p>
    {s.missing.length > 0 && <p className={styles.muted}>Sem preço: {s.missing.join(", ")}. Preencha na etapa Tesoura.</p>}
  </section>;
}

/** Campo em centímetros sobre um valor guardado em milímetros. */
function Cm({ label, mm, onMm, hint, min = 0, max = 100000 }: { label: string; mm: number; onMm: (mm: number) => void; hint?: string; min?: number; max?: number }) {
  return <NumberField label={label} hint={hint} value={Math.round(mm) / 10} min={min} max={max} decimals={1} onChange={v => { if (v !== null) onMm(Math.round(v * 10 * 10) / 10); }} />;
}

function Drawing({ t, selected, onSelect }: { t: Truss; selected: number | null; onSelect: (i: number) => void }) {
  const L = trussLengthMm(t), S = slopeCount(t), st = stations(t), pieces = trussPiecesComplete(t), purlins = roofPurlinPositions(t), off = tipOffsetMm(t);
  const cols = t.support === "columns", th = cols ? 120 : t.walls.thicknessMm, sMin = -off - th, sMax = L * S + th;
  const W = 1000, padL = 46, padR = 46, sx = (W - padL - padR) / (sMax - sMin);
  const vz = Math.min(sx * 4, 330 / Math.max(t.highHeightMm, 1)), stub = 120;
  const top = 40, H = top + t.highHeightMm * vz + stub + 110;
  const X = (s: number) => padL + (s - sMin) * sx, base = top + t.highHeightMm * vz, Y = (z: number) => base - z * vz;
  // Muros e calha: posição relativa ao banzo inferior (z = 0), altura em escala real limitada ao desenho.
  const Yw = (zFloor: number) => { const dz = zFloor - t.supportZMm; return dz >= 0 ? Y(Math.min(dz, t.highHeightMm + 150 / vz)) : Math.min(base + (-dz) * sx, base + stub); };
  const wallBottom = base + stub;
  const g = t.gutter, gx0 = -off + g.supportMm, gx1 = gx0 + g.widthMm, gTop = base, gBot = base + Math.max(g.lowSideMm, g.highSideMm) * sx * 1.5;
  const plateH = Math.min(t.anchor.plateHeightMm * sx * 1.5, base - Y(t.highHeightMm) + 20);
  const panels = st.slice(1).map((s, i) => [st[i], s]);
  return <svg className={styles.drawing} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={cols ? "Elevação da tesoura sobre pilares (altura da tesoura exagerada para leitura)" : "Elevação da tesoura com muros e calha (altura da tesoura exagerada para leitura)"}>
    {cols ? [0, L * S].map(x => <rect key={`p${x}`} x={X(x) - th * sx / 2} y={base} width={th * sx} height={stub} className={styles.column}><title>Pilar {t.column.designation}, {cm(t.supportZMm)} cm</title></rect>) : <>
    <rect x={X(sMin)} y={Yw(t.walls.lowMm)} width={th * sx} height={wallBottom - Yw(t.walls.lowMm)} className={styles.wall}><title>Muro baixo {cm(t.walls.lowMm)} cm</title></rect>
    <rect x={X(L * S)} y={Yw(S === 2 ? t.walls.lowMm : t.walls.highMm)} width={th * sx} height={wallBottom - Yw(S === 2 ? t.walls.lowMm : t.walls.highMm)} className={styles.wall}><title>{S === 2 ? "Muro do outro beiral" : "Muro alto"}</title></rect>
    <rect x={X(-off)} y={gTop + 4} width={g.supportMm * sx} height={8} className={styles.ledge}><title>Apoio da calha</title></rect>
    <path d={`M ${X(gx0)} ${gTop + (g.highSideMm - g.lowSideMm) * sx * 1.5} V ${gBot} H ${X(gx1)} V ${gTop}`} className={styles.gutter}><title>Calha {cm(g.widthMm)} cm</title></path>
    {S === 2 && <path d={`M ${X(2 * L - gx0)} ${gTop + (g.highSideMm - g.lowSideMm) * sx * 1.5} V ${gBot} H ${X(2 * L - gx1)} V ${gTop}`} className={styles.gutter}><title>Calha do beiral direito</title></path>}
    {(S === 2 ? [0, 2 * L] : [L]).map(x => <rect key={x} x={X(x) - 6} y={base - plateH / 2 - (base - Y(t.highHeightMm)) / 2} width={6} height={plateH} className={styles.plate}><title>Posição declarada da chapa (sem verificação)</title></rect>)}
    {(S === 2 ? [0, 2 * L] : [L]).flatMap(x => Array.from({ length: t.anchor.boltsPerSupport }, (_, i) => { const yb = base - (base - Y(t.highHeightMm)) / 2 - plateH / 2 + plateH * (i + 1) / (t.anchor.boltsPerSupport + 1);
      return <line key={`${x}-${i}`} x1={X(x) - 10} y1={yb} x2={X(x) + Math.min(t.anchor.boltLengthMm, th * 0.85) * sx} y2={yb} className={styles.bolt} />; }))}
    </>}
    {pieces.filter(p => p.kind === "D").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.web} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").map(p => <line key={p.id} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} className={styles.chord} />)}
    {pieces.filter(p => p.kind === "BI" || p.kind === "BS").filter(p => p.id.endsWith("-A") && p.b[0] < L * S - 1).map(p => <circle key={`e${p.id}`} cx={X(p.b[0])} cy={Y(p.b[1])} r={5} className={styles.splice}><title>Emenda do banzo</title></circle>)}
    {st.map((s, i) => <g key={s} tabIndex={0} onClick={() => onSelect(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } }} className={selected === i ? styles.selected : styles.post} role="button" aria-label={`Montante ${i + 1}, ${cm(s)} cm da ponta`}>
      <line x1={X(s)} y1={Y(0)} x2={X(s)} y2={Y(t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * s / L)} />
      <rect x={X(s) - 9} y={Y(t.highHeightMm) - 10} width={18} height={Y(0) - Y(t.highHeightMm) + 20} fill="transparent" stroke="none" />
    </g>)}
    {purlins.map((p, i) => { const z = t.tipHeightMm + (t.highHeightMm - t.tipHeightMm) * p.sMm / L;
      return <rect key={i} x={X(p.xMm) - 7} y={Y(z) - 12} width={14} height={10} className={p.onNode ? styles.purlin : styles.purlinOff}><title>{p.onNode ? "Terça no nó" : "Terça fora de nó"}</title></rect>; })}
    {cols ? <>
      <text x={X(sMin)} y={wallBottom + 26} className={styles.wallText} textAnchor="start">pilar {cm(t.supportZMm)}</text>
      <text x={X(sMax)} y={wallBottom + 26} className={styles.wallText} textAnchor="end">pilar {cm(t.supportZMm)}</text>
    </> : <>
      <text x={X(sMin)} y={wallBottom + 26} className={styles.wallText} textAnchor="start">muro {cm(t.walls.lowMm)}</text>
      <text x={X(sMax)} y={wallBottom + 26} className={styles.wallText} textAnchor="end">muro {cm(S === 2 ? t.walls.lowMm : t.walls.highMm)}</text>
      <text x={X((gx0 + gx1) / 2)} y={gBot + 22} className={styles.dim}>calha {cm(g.widthMm)}</text>
    </>}
    {panels.map(([a, b], i) => (panels.length <= 12 || i % 2 === 0 || i === panels.length - 1) && <text key={a} x={X((a + b) / 2)} y={base + 26} className={styles.dim}>{cm(b - a)}</text>)}
    <line x1={X(0)} y1={H - 38} x2={X(L * S)} y2={H - 38} className={styles.dimLine} />
    <text x={X(L * S / 2)} y={H - 8} className={styles.dimStrong}>{m(L * S)} m de tesoura · {S === 2 ? "2 águas" : "1 água"} · inclinação {fallPercent(t).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %</text>
    <text x={X(0) + 6} y={Y(t.tipHeightMm) - 10} className={styles.dimSide} textAnchor="start">{cm(t.tipHeightMm)}</text>
    <text x={X(L) - 10} y={Y(t.highHeightMm) - 12} className={styles.dimSide} textAnchor="end">{cm(t.highHeightMm)}{S === 2 ? " (cumeeira)" : ""}</text>
  </svg>;
}

export function TrussEditor({ initial, onApply, applyLabel, replaces }: { initial?: Truss; onApply: (t: Truss) => void; applyLabel: string;
  /** Peças de outra origem que "Aplicar" vai apagar (pilares, vigas...). Se houver, pede confirmação. */
  replaces?: string[] }) {
  const [confirming, setConfirming] = useState(false);
  const [t, setT] = useState<Truss>(() => initial ?? blankTruss());
  const [selected, setSelected] = useState<number | null>(null);
  const [trussesAuto, setTrussesAuto] = useState(!initial);
  const [message, setMessage] = useState("");
  const set = (patch: Partial<Truss>) => { setMessage(""); setT(prev => ({ ...prev, ...patch })); };
  const result = useMemo(() => {
    try { const parsed = trussEditorSchema.parse(t); return { s: trussSummary(parsed), issues: trussIssues(parsed), error: "" }; }
    catch (e) { return { s: null, issues: [], error: e instanceof Error ? e.message.split("\n")[0] : "Medidas inválidas." }; }
  }, [t]);
  // Tipo em edição: a cobertura é da obra; desenho interno e perfis são do tipo.
  const [editing, setEditing] = useState(BASE_TYPE);
  const editingId = editing === BASE_TYPE || t.types.some(x => x.id === editing) ? editing : BASE_TYPE;
  const v = trussOfType(t, editingId);
  const setGeom = (patch: Partial<Truss>) => {
    if (editingId === BASE_TYPE) return set(patch);
    const own = Object.fromEntries(Object.entries(patch).filter(([k]) => (TYPE_KEYS as readonly string[]).includes(k)));
    const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !(TYPE_KEYS as readonly string[]).includes(k)));
    set({ ...rest, types: t.types.map(x => x.id === editingId ? { ...x, ...own } : x) });
  };
  const st = stations(v), L = trussLengthMm(v);
  // Banzos e montantes: perfil do tipo em edição; terças e pilares: da obra.
  type ProfileKey = "chord" | "bottomChord" | "web" | "purlin" | "column";
  const ofType = (k: ProfileKey) => k === "chord" || k === "bottomChord" || k === "web";
  // Banzo inferior sem perfil próprio mostra (e parte de) o banzo superior.
  const src = (k: ProfileKey): Truss["chord"] => k === "bottomChord" ? (v.bottomChord ?? v.chord) : (ofType(k) ? v : t)[k];
  const setProfile = (k: ProfileKey, p: Truss["chord"]) => ofType(k) ? setGeom({ [k]: p } as Partial<Truss>) : set({ [k]: p } as Partial<Truss>);
  const profileTitle = { chord: "Banzo superior", bottomChord: "Banzo inferior", web: "Montantes e diagonais", purlin: "Terças", column: "Pilares" } as const;
  const sameChord = v.bottomChord === null;
  const editStations = (next: number[]) => setGeom({ stationsMm: [...new Set(next)].sort((a, b) => a - b) });
  const sel = selected !== null && selected < st.length ? selected : null;
  const errors = result.issues.filter(i => i.level === "erro");
  const notes = result.issues.filter(i => i.level === "aviso");

  return <div className={styles.editor}>
    <div className={styles.canvas}>
      <div className={styles.typeBar}>
        <Field label="Desenhando"><Select value={editingId} onChange={e => { setEditing(e.target.value); setSelected(null); }}>
          {[BASE_TYPE, ...t.types.map(x => x.id)].map(id => <option key={id} value={id}>{typeName(t, id)}{t.types.length ? ` · linhas ${Array.from({ length: t.trusses }, (_, i) => i).filter(i => lineTypeId(t, i) === id).map(i => i + 1).join(", ") || "nenhuma"}` : ""}</option>)}
        </Select></Field>
        {editingId !== BASE_TYPE && <Field label="Nome do tipo"><Input value={t.types.find(x => x.id === editingId)?.name ?? ""} maxLength={40} onChange={e => set({ types: t.types.map(x => x.id === editingId ? { ...x, name: e.target.value } : x) })} /></Field>}
        <div className={styles.row}>
          <button type="button" className="button secondary" disabled={t.types.length >= 9} onClick={() => { const next = addTrussType(t, editingId); const id = next.types.at(-1)?.id; set({ types: next.types }); if (id) setEditing(id); setSelected(null); }}><Plus size={16} />Novo tipo (copia este)</button>
          {editingId !== BASE_TYPE && <button type="button" className="button secondary" onClick={() => { const next = removeTrussType(t, editingId); set({ types: next.types, lineTypes: next.lineTypes }); setEditing(BASE_TYPE); setSelected(null); }}><Trash2 size={16} />Remover tipo</button>}
        </div>
        {t.types.length > 0 && <div className={styles.lines} aria-label="Tipo de cada tesoura">
          {steelTrussLines(t).map(i => <Field key={i} label={`Tesoura ${i + 1}`}><Select value={lineTypeId(t, i)} onChange={e => { const next = Array.from({ length: t.trusses }, (_, j) => lineTypeId(t, j)); next[i] = e.target.value; set({ lineTypes: next }); }}>
            {[BASE_TYPE, ...t.types.map(x => x.id)].map(id => <option key={id} value={id}>{typeName(t, id)}</option>)}
          </Select></Field>)}
        </div>}
      </div>
      <Drawing t={v} selected={sel} onSelect={i => setSelected(i)} />
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
          {sel < st.length - 1 && v.diagonal !== "none" && v.diagonal !== "x" && <button type="button" className="button secondary" onClick={() => setGeom({ flippedPanels: v.flippedPanels.includes(sel) ? v.flippedPanels.filter(i => i !== sel) : [...v.flippedPanels, sel] })}><ArrowLeftRight size={18} />Inverter diagonal deste painel</button>}
        </div>
      </div>}
    </div>

    <div className={styles.side}>
      <section className={styles.card} aria-label="Resumo">
        <h3>Resumo ao vivo</h3>
        {result.error && <p className={styles.error}>{result.error}</p>}
        {result.s && <>
          <div className={styles.kpis}>
            <div><b>{result.s.buy.chord}</b><span>barras {sameChord ? t.chord.designation : `banzos (${t.chord.designation} em cima · ${(t.bottomChord ?? t.chord).designation} embaixo)`}</span></div>
            <div><b>{result.s.buy.web}</b><span>barras {t.web.designation}{t.fullHeightBudget ? " (medida cheia)" : ""}</span></div>
            <div><b>{result.s.buy.purlin}</b><span>barras {t.purlin.designation}</span></div>
            <div><b>{Math.round(result.s.kg.total)} kg</b><span>{(result.s.kg.total / (t.spanMm * t.lengthMm / 1e6)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/m² de aço</span></div>
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={t.fullHeightBudget} onChange={e => set({ fullHeightBudget: e.target.checked })} /><span><strong>Orçar pela medida cheia</strong><small>Todo montante com {cm(t.highHeightMm)} cm: {result.s.bars.webFullHeight} barras (medidas reais: {result.s.bars.web}). O plano de corte sempre usa as reais.</small></span></label>
          <BudgetTable s={result.s} />
          <p className={styles.muted}>{result.s.gutterLine}.</p>
          {result.s.missing.length > 0 && <p className={styles.muted}>Sem preço: {result.s.missing.join(", ")}.</p>}
        </>}
        {errors.map(i => <p key={i.message} className={styles.error}><TriangleAlert size={15} />{i.message}</p>)}
        {/* Um aviso só: a lista sai completa e o engenheiro confere tudo de uma vez. */}
        <div className={styles.review} data-testid="truss-engineer-review">
          <p><TriangleAlert size={15} /><strong>Necessária conferência por engenheiro para validação.</strong></p>
          {notes.length > 0 && <details><summary>Pontos para o engenheiro conferir ({notes.length})</summary><ul>{notes.map(i => <li key={i.message}>{i.message}</li>)}</ul></details>}
        </div>
        {confirming && !!replaces?.length && <div className={styles.replaceWarning} role="alert" data-testid="truss-replace-warning">
          <p><TriangleAlert size={15} /><strong>Aplicar vai substituir a estrutura desta obra.</strong></p>
          <p>{columnCount(t)
            ? `O editor remonta a estrutura: ${steelTrussLines(t).length} tesouras${gableCount(t) ? ` (+ ${gableCount(t)} oitão)` : ""}, terças e ${columnCount(t)} pilares nas pontas das tesouras (onde a ponta apoia em pilar). Estas peças atuais serão substituídas:`
            : "O editor monta só tesouras e terças apoiadas nos muros. Estas peças atuais vão sumir:"}</p>
          <ul>{replaces.map(l => <li key={l}>{l}</li>)}</ul>
          <p>Para guardar a obra como está, cancele e use Projetos → Duplicar antes de aplicar.</p>
        </div>}
        <div className={styles.actions}>
          <button type="button" className="button" disabled={!!result.error || errors.length > 0} onClick={() => {
            if (replaces?.length && !confirming) { setConfirming(true); setMessage(""); return; }
            try { onApply(trussEditorSchema.parse(t)); setConfirming(false); setMessage("Aplicado. 3D, CAD, materiais e plano de corte usam esta tesoura."); } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível aplicar."); } }}>
            <Check size={18} />{confirming ? "Substituir mesmo assim" : applyLabel}</button>
          {confirming && <button type="button" className="button secondary" onClick={() => setConfirming(false)}>Cancelar</button>}
          <button type="button" className="button secondary" onClick={() => { setT(blankTruss()); setTrussesAuto(true); setSelected(null); setMessage("Obra nova no padrão do Tom: digite as medidas da obra por cima. Preços do Tom já preenchidos; informe os insumos."); }}><FilePlus2 size={18} />Nova obra</button>
          <button type="button" className="button secondary" onClick={() => { setT(tomTrussDefaults()); setTrussesAuto(false); setSelected(null); }}><RotateCcw size={18} />Exemplo 8×10</button>
        </div>
        {message && <p className={styles.ok} role="status">{message}</p>}
      </section>

      <section className={styles.card}>
        <h3>Obra</h3>
        <div className={styles.grid}>
          <Field label="Tipo de cobertura"><Select value={t.roofKind} onChange={e => {
            set(reflowTruss(t, { roofKind: e.target.value as Truss["roofKind"] }));
          }}><option value="one-slope">Uma água</option><option value="two-slopes">Duas águas simétricas</option></Select></Field>
          <Field label="Apoio da tesoura"><Select value={t.lineSupports.length ? "mixed" : t.support} data-testid="truss-support-mode" onChange={e => {
            const mode = e.target.value;
            if (mode === "mixed") set({ lineSupports: withEndSupports(t, () => null) });
            else set({ ...reflowTruss(t, { support: mode as Truss["support"] }), lineSupports: [] });
          }}>
            <option value="walls">Tudo sobre muros</option><option value="columns">Tudo sobre pilares (obra completa)</option><option value="mixed">Misto: parte muro, parte pilar</option></Select></Field>
          {t.lineSupports.length > 0 && <Field label="Medidas da obra"><Select value={t.support} onChange={e => set(reflowTruss(t, { support: e.target.value as Truss["support"] }))}>
            <option value="walls">muro a muro (com calha)</option><option value="columns">eixo a eixo dos pilares</option></Select></Field>}
          <Cm label={t.support === "columns" ? "Vão entre eixos dos pilares (cm)" : "Muro a muro (cm)"} mm={t.spanMm} onMm={spanMm => set(reflowTruss(t, { spanMm }))} min={100} />
          <Cm label="Comprimento (cm)" mm={t.lengthMm} onMm={lengthMm => set({ lengthMm, ...(trussesAuto ? { trusses: suggestedTrussCount(lengthMm,t.stockMm) } : {}) })} min={100} />
          {t.support === "walls" && <Cm label="Altura do muro baixo (cm)" mm={t.walls.lowMm} onMm={v => set({ walls: { ...t.walls, lowMm: v } })} hint="Do piso ao topo." />}
          {t.support === "walls" && t.roofKind === "one-slope" && <Cm label="Altura do muro alto (cm)" mm={t.walls.highMm} onMm={v => set({ walls: { ...t.walls, highMm: v } })} hint="Referência para a ancoragem no lado alto." />}
          {t.roofKind === "two-slopes" && <p className={styles.muted}>Duas águas: mesmo nível nos dois beirais, cumeeira central e calhas dos dois lados. Sem atribuir vínculos ou ligações.</p>}
          {t.support === "walls" && <Cm label="Espessura do muro (cm)" mm={t.walls.thicknessMm} onMm={v => set({ walls: { ...t.walls, thicknessMm: v } })} min={5} />}
          <Cm label={t.support === "columns" ? "Altura do pilar (cm)" : "Banzo de baixo a partir do piso (cm)"} mm={t.supportZMm} onMm={supportZMm => set({ supportZMm })} hint={t.support === "columns" ? "Do piso ao banzo de baixo da tesoura." : "Altura de apoio da tesoura."} />
          {t.support === "columns" && <p className={styles.muted}>Tesoura de eixo a eixo dos pilares. Onde já existe muro, troque a ponta para muro em &quot;Apoios por tesoura&quot;.</p>}
          <NumberField label={gableCount(t) ? "Linhas de apoio (tesouras + oitão)" : "Tesouras"} value={t.trusses} min={2} max={60} decimals={0} onChange={v => { if (v !== null) { setTrussesAuto(false); set({ trusses: v }); } }}
            hint={gableCount(t) ? `A cada ${m(t.lengthMm / (t.trusses - 1))} m · ${steelTrussLines(t).length} tesoura(s) de aço + ${gableCount(t)} oitão` : `A cada ${m(t.lengthMm / (t.trusses - 1))} m · não verificado estruturalmente`} />
          <Field label="Ponta apoiada na parede (oitão)"><Select value={t.gableEnds.start && t.gableEnds.end ? "both" : t.gableEnds.start ? "start" : t.gableEnds.end ? "end" : "none"} data-testid="truss-gable-ends"
            onChange={e => { const v = e.target.value; set({ gableEnds: { start: v === "both" || v === "start", end: v === "both" || v === "end" } }); }}>
            <option value="none">não — tesoura nas duas pontas</option>
            <option value="start">só no começo (no lugar da tesoura 1)</option>
            <option value="end">só no fim (no lugar da tesoura {t.trusses})</option>
            <option value="both">nas duas pontas</option>
          </Select></Field>
          {gableCount(t) > 0 && <p className={styles.muted} data-testid="truss-gable-note">Onde tem oitão não entra tesoura: a parede sobe na inclinação do telhado e as terças são chumbadas nela. Economiza {gableCount(t)} tesoura(s).</p>}
          <label className={styles.toggle}><input type="checkbox" checked={trussesAuto} onChange={e => { setTrussesAuto(e.target.checked); if(e.target.checked) set({ trusses: suggestedTrussCount(t.lengthMm,t.stockMm) }); }} /><span><strong>Quantidade automática (preliminar)</strong><small>Pela barra comercial. Apoios e espaçamento resistente exigem validação.</small></span></label>
        </div>
      </section>
      <SupportsCard t={t} set={set} />
      {t.support === "walls" && <section className={styles.card}>
        <h3>Calha e ponta baixa</h3>
        <div className={styles.grid}>
          <Cm label="Apoio da calha no muro (cm)" mm={t.gutter.supportMm} onMm={v => set(reflowTruss(t, { gutter: { ...t.gutter, supportMm: v } }))} />
          <Cm label="Largura da calha (cm)" mm={t.gutter.widthMm} onMm={v => set(reflowTruss(t, { gutter: { ...t.gutter, widthMm: v } }))} />
          <Cm label="Da calha até a ponta (cm)" mm={t.gutter.clearanceMm} onMm={v => set(reflowTruss(t, { gutter: { ...t.gutter, clearanceMm: v } }))} />
          <Cm label="Lado menor da calha (cm)" mm={t.gutter.lowSideMm} onMm={v => set({ gutter: { ...t.gutter, lowSideMm: v } })} hint="Lado da telha." />
          <Cm label="Lado maior da calha (cm)" mm={t.gutter.highSideMm} onMm={v => set({ gutter: { ...t.gutter, highSideMm: v } })} hint="Lado do muro." />
        </div>
        <label className={styles.toggle}><input type="checkbox" checked={t.gutter.budgeted} onChange={e => set({ gutter: { ...t.gutter, budgeted: e.target.checked } })} /><span><strong>Calha entra no orçamento</strong><small>Desligado: a calha aparece no desenho, mas não soma. Com duas águas, o comprimento é contado nos dois beirais.</small></span></label>
        {t.gutter.budgeted && <NumberField label="Calha (R$/metro)" money value={t.gutter.pricePerMCents} min={0} max={100000} decimals={2} onChange={v => set({ gutter: { ...t.gutter, pricePerMCents: v } })} hint="Sem preço informado, o custo fica pendente." />}
      </section>}
      <section className={styles.card}>
        <h3>Geometria da tesoura</h3>
        <div className={styles.grid}>
          <Cm label="Altura na ponta (cm)" mm={t.tipHeightMm} onMm={tipHeightMm => set({ tipHeightMm })} min={0.1} />
          <Cm label={t.roofKind === "two-slopes" ? "Altura na cumeeira (cm)" : "Altura no lado alto (cm)"} mm={t.highHeightMm} onMm={highHeightMm => set({ highHeightMm })} min={0.1} />
          <NumberField label="Caída (%)" value={Math.round(fallPercent(t) * 100) / 100} min={0.5} max={60} decimals={2} onChange={v => v !== null && setT(prev => withFall(prev, v))} hint={t.roofKind === "two-slopes" ? "Inclinação de cada água, muda a cumeeira." : "Muda a altura do lado alto."} />
          <Cm label="Painel (cm)" mm={v.panelMm} onMm={panelMm => setGeom({ panelMm, stationsMm: null, flippedPanels: [] })} min={10} hint={editingId !== BASE_TYPE ? `Só no ${typeName(t, editingId)}.` : undefined} />
          <Field label="Contar painéis a partir"><Select value={v.countFrom} onChange={e => setGeom({ countFrom: e.target.value as Truss["countFrom"], stationsMm: null, flippedPanels: [] })}><option value="high">do lado alto (sobra na ponta)</option><option value="low">da ponta (sobra no alto)</option></Select></Field>
          <Field label="Diagonais"><Select value={v.diagonal} onChange={e => setGeom({ diagonal: e.target.value as Truss["diagonal"], flippedPanels: [] })}><option value="to-high">subindo para o lado alto</option><option value="to-low">subindo para a ponta</option><option value="x">em X</option><option value="none">sem diagonal</option></Select></Field>
          <Cm label="Emenda do banzo a partir da ponta (cm)" mm={t.chordSpliceMm} onMm={chordSpliceMm => set({ chordSpliceMm })} min={50} />
        </div>
        {v.stationsMm && <button type="button" className="button secondary" onClick={() => setGeom({ stationsMm: null, flippedPanels: [] })}><RotateCcw size={16} />Desfazer ajustes ponto a ponto ({st.length} montantes)</button>}
      </section>
      <section className={styles.card}>
        <h3>{columnCount(t) && trussEnds(t).some(e => e.kind === "wall") ? "Chapas e chumbadores (pilares e muros)" : t.support === "columns" ? "Chapa de base dos pilares" : t.roofKind === "two-slopes" ? "Ancoragens nos dois beirais" : "Ancoragem no muro alto"}</h3>
        <div className={styles.grid}>
          <Cm label="Chapa largura (cm)" mm={t.anchor.plateWidthMm} onMm={v => set({ anchor: { ...t.anchor, plateWidthMm: v } })} />
          <Cm label="Chapa altura (cm)" mm={t.anchor.plateHeightMm} onMm={v => set({ anchor: { ...t.anchor, plateHeightMm: v } })} />
          <NumberField label={columnCount(t) && trussEnds(t).some(e => e.kind === "wall") ? "Chumbadores por chapa" : t.support === "columns" ? "Chumbadores por pilar" : t.roofKind === "two-slopes" ? "Chumbadores por beiral/tesoura" : "Chumbadores por tesoura"} value={t.anchor.boltsPerSupport} min={0} max={20} decimals={0} onChange={v => v !== null && set({ anchor: { ...t.anchor, boltsPerSupport: v } })} />
          <Cm label="Comprimento do chumbador (cm)" mm={t.anchor.boltLengthMm} onMm={v => set({ anchor: { ...t.anchor, boltLengthMm: v } })} />
          <NumberField label="Chapa (R$/un)" money value={t.anchor.platePriceCents} min={0} max={100000} decimals={2} onChange={v => set({ anchor: { ...t.anchor, platePriceCents: v } })} />
          <NumberField label="Chumbador (R$/un)" money value={t.anchor.boltPriceCents} min={0} max={100000} decimals={2} onChange={v => set({ anchor: { ...t.anchor, boltPriceCents: v } })} />
        </div>
      </section>
      <section className={styles.card}>
        <h3>Terças</h3>
        <div className={styles.grid}>
          <NumberField label={t.roofKind === "two-slopes" ? "Linhas de terça por água" : "Linhas de terça"} value={t.purlinLines} min={2} max={60} decimals={0} onChange={v => v !== null && set({ purlinLines: v })} />
          <Cm label={t.roofKind === "two-slopes" ? "Espaço a partir da cumeeira (cm)" : "Espaço a partir do lado alto (cm)"} mm={t.purlinStepMm} onMm={purlinStepMm => set({ purlinStepMm })} min={30} hint="A última terça fica na ponta." />
        </div>
      </section>
      <section className={styles.card}>
        <h3>Perfis e preços</h3>
        <label className={styles.toggle}><input type="checkbox" checked={sameChord} data-testid="truss-same-chord"
          onChange={e => setGeom({ bottomChord: e.target.checked ? null : { ...v.chord } })} />
          <span><strong>Banzo inferior com o mesmo perfil do superior</strong><small>Desmarque para usar um perfil mais leve (ou mais pesado) embaixo. Vale para tesoura sobre muro e sobre pilar.</small></span></label>
        {(["chord", ...(sameChord ? [] : ["bottomChord"] as const), "web", "purlin", ...(columnCount(t) ? ["column"] as const : [])] as ProfileKey[]).map(k => <div key={k} className={styles.grid} data-testid={`truss-profile-${k}`}>
          <Field label={`${k === "chord" && sameChord ? "Banzos (superior e inferior)" : profileTitle[k]}: escolher`}><Select value={COMMON_PROFILES.some(p => p.designation === src(k).designation) ? src(k).designation : ""} onChange={e => { const p = COMMON_PROFILES.find(x => x.designation === e.target.value); if (p) setProfile(k, { ...src(k), designation: p.designation, kgPerM: p.kgPerM }); }}>
            <option value="">outro (digitar)</option>
            {COMMON_PROFILES.filter(p => p.use.includes(k === "bottomChord" ? "chord" : k)).concat(COMMON_PROFILES.filter(p => !p.use.includes(k === "bottomChord" ? "chord" : k))).map(p => <option key={p.designation} value={p.designation}>{p.designation} · {p.kgPerM.toLocaleString("pt-BR")} kg/m</option>)}
          </Select></Field>
          <Field label="Nome do perfil"><Input value={src(k).designation} onChange={e => setProfile(k, { ...src(k), designation: e.target.value })} /></Field>
          <NumberField label="kg/m" value={src(k).kgPerM} min={0.01} max={1000} decimals={3} onChange={v => v !== null && setProfile(k, { ...src(k), kgPerM: v })} />
          <NumberField label="Preço da barra (R$)" money value={src(k).barPriceCents} min={0} max={1000000} decimals={2} onChange={v => setProfile(k, { ...src(k), barPriceCents: v })} />
          <NumberField label="Barras de folga" value={src(k).extraBars} min={0} max={100} decimals={0} onChange={v => v !== null && setProfile(k, { ...src(k), extraBars: v })} hint="Somadas na compra." />
        </div>)}
        <Cm label="Barra comercial (cm)" mm={t.stockMm} onMm={stockMm => set({ stockMm, ...(trussesAuto ? { trusses: suggestedTrussCount(t.lengthMm,stockMm) } : {}) })} min={100} />
        <p className={styles.muted}>kg/m da lista: valores nominais de referência; confira com o fornecedor.</p>
      </section>
      <section className={styles.card}>
        <h3>Telha e serviço</h3>
        <div className={styles.grid}>
          <Cm label="Largura útil da telha (cm)" mm={t.sheet.usefulWidthMm} onMm={v => set({ sheet: { ...t.sheet, usefulWidthMm: v } })} min={30} />
          <Cm label="Telha além da ponta (cm)" mm={t.sheet.beyondTipMm} onMm={v => set({ sheet: { ...t.sheet, beyondTipMm: v } })} hint="Até dentro da calha." />
          <NumberField label="Peças de telha por água" value={t.sheet.piecesPerSlope} min={1} max={6} decimals={0} onChange={v => v !== null && set({ sheet: { ...t.sheet, piecesPerSlope: v } })} hint="1 = telha inteira." />
          {t.sheet.piecesPerSlope > 1 && <Cm label="Sobreposição (cm)" mm={t.sheet.overlapMm} onMm={v => set({ sheet: { ...t.sheet, overlapMm: v } })} />}
          <NumberField label="Telha R$/m" money value={t.sheet.pricePerMCents} min={0} max={100000} decimals={2} onChange={v => set({ sheet: { ...t.sheet, pricePerMCents: v } })} />
          <NumberField label="Mão de obra R$/m²" money value={t.laborPerM2Cents} min={0} max={1000000} decimals={2} onChange={v => set({ laborPerM2Cents: v })} />
          <NumberField label="Insumos (R$)" money value={t.consumablesCents} min={0} max={10000000} decimals={2} onChange={v => set({ consumablesCents: v })} />
          <NumberField label="Parafuso (R$/un)" money value={t.screwPriceCents} min={0} max={1000} decimals={2} onChange={v => set({ screwPriceCents: v })} />
        </div>
      </section>
      <p className={styles.notice}>Lista de materiais preliminar. A preparação do cálculo utiliza hipóteses de perfis e ligações; vento, contraventamento e verificações de apoio permanecem pendentes. Aprovação estrutural e fabricação bloqueadas.</p>
    </div>
  </div>;
}

/** Apoios: o Tom só mexe aqui se a obra for MISTA (onde termina o muro e começam os pilares).
 * Lista de materiais (pilares, chapas, chumbadores) sai sozinha. Engenharia fica no "Avançado"
 * e nunca impede o orçamento preliminar. */
function SupportsCard({ t, set }: { t: Truss; set: (patch: Partial<Truss>) => void }) {
  const S = slopeCount(t), ends = trussEnds(t), mixed = t.lineSupports.length > 0;
  const sideName = (side: TrussSide) => S === 2 ? (side === "left" ? "Lado esquerdo" : "Lado direito") : (side === "left" ? "Lado da ponta baixa" : "Lado alto");
  const walls = ends.filter(e => e.kind === "wall").length, cols = ends.length - walls;
  const bothWalls = steelTrussLines(t).map(i => endSupportOf(t, i, "left") === "wall" && endSupportOf(t, i, "right") === "wall").some(Boolean);
  const one = (line: number, side: TrussSide, kind: EndSupport) => set({ lineSupports: withEndSupports(t, (l, s) => l === line && s === side ? kind : null) });
  const sm = t.supportModel, setModel = (patch: Partial<Truss["supportModel"]>) => set({ supportModel: { ...sm, ...patch } });
  // Trecho de muro por lado: "muro da tesoura A até a B", o resto em pilar.
  const wallLines = (side: TrussSide) => ends.filter(e => e.side === side && e.kind === "wall").map(e => e.line + 1);
  const range = (side: TrussSide) => { const w = wallLines(side); return w.length && w.at(-1)! - w[0] + 1 === w.length ? [w[0], w.at(-1)!] : null; };
  const sideMode = (side: TrussSide) => { const w = wallLines(side).length; return w === steelTrussLines(t).length ? "wall" : w === 0 ? "column" : range(side) ? "range" : "custom"; };
  const setRange = (side: TrussSide, from: number, to: number) => set({ lineSupports: withEndSupports(t, (l, s) => s !== side ? null : l + 1 >= from && l + 1 <= to ? "wall" : "column") });
  const setSide = (side: TrussSide, mode: string) => mode === "wall" ? setRange(side, 1, t.trusses) : mode === "column" ? setRange(side, 0, -1)
    : mode === "range" ? setRange(side, 1, Math.max(1, Math.ceil(t.trusses / 2))) : undefined;
  const engineeringPending = walls > 0 && sm.wallSiteReview.trim().length < 5;
  return <section className={styles.card} data-testid="truss-supports">
    <h3>Apoios</h3>
    <p className={styles.muted} data-testid="truss-supports-summary">{walls} ponta(s) em muro · {cols} em pilar → {cols} pilar(es), {cols} chapa(s) de base, {wallPlateCount(t)} chapa(s) de ancoragem e {(cols + wallPlateCount(t)) * t.anchor.boltsPerSupport} chumbador(es) na lista.</p>
    {walls > wallPlateCount(t) && <p className={styles.muted}>Atenção: em coberturas de uma água, a regra herdada contabiliza chapas de ancoragem apenas na ponta alta. Confira se a ponta baixa também precisa de chapa ou fixação antes da compra.</p>}
    {mixed && <div className={styles.grid}>
      {(["left", "right"] as const).map(side => <div key={side} className={styles.grid} data-testid={`truss-side-${side}`}>
        <Field label={sideName(side)}><Select value={sideMode(side)} onChange={e => setSide(side, e.target.value)} data-testid={`truss-side-mode-${side}`}>
          <option value="wall">muro em todas</option><option value="column">pilar em todas</option><option value="range">muro em parte, pilar no resto</option>
          {sideMode(side) === "custom" && <option value="custom">ajustado tesoura por tesoura</option>}
        </Select></Field>
        {sideMode(side) === "range" && <>
          <NumberField label="Muro da tesoura" value={range(side)![0]} min={1} max={t.trusses} decimals={0} onChange={v => v !== null && setRange(side, v, Math.max(v, range(side)![1]))} />
          <NumberField label="até a tesoura" value={range(side)![1]} min={1} max={t.trusses} decimals={0} onChange={v => v !== null && setRange(side, Math.min(v, range(side)![0]), v)} hint="As outras apoiam em pilar." />
        </>}
      </div>)}
    </div>}
    {mixed && <details className={styles.details}>
      <summary>Ajustar tesoura por tesoura</summary>
      <div className={styles.lines} aria-label="Apoio de cada ponta por tesoura">
        {steelTrussLines(t).map(i => (["left", "right"] as const).map(side => <Field key={`${i}-${side}`} label={`T${i + 1} — ${sideName(side).toLowerCase()}`}>
          <Select value={endSupportOf(t, i, side)} onChange={e => one(i, side, e.target.value as EndSupport)} data-testid={`truss-end-${i + 1}-${side}`}>
            <option value="wall">muro</option><option value="column">pilar</option>
          </Select></Field>)).flat()}
      </div>
    </details>}
    <details className={styles.details} data-testid="truss-supports-advanced">
      <summary>Avançado — engenharia (não muda a lista de materiais){engineeringPending ? " · conferência do muro pendente" : ""}</summary>
      <p className={styles.muted}>Hipóteses para o cálculo estrutural. O orçamento preliminar sai sem isso; a aprovação estrutural é que fica pendente.</p>
      <div className={styles.grid}>
        {cols > 0 && <Field label="Base do pilar"><Select value={sm.columnBase} onChange={e => setModel({ columnBase: e.target.value as Truss["supportModel"]["columnBase"] })}>
          <option value="fixed">engastada (chapa + chumbadores)</option><option value="pinned">articulada (exige contraventamento)</option></Select></Field>}
        {bothWalls && <label className={styles.toggle}><input type="checkbox" checked={sm.wallsSlide} onChange={e => setModel({ wallsSlide: e.target.checked })} />
          <span><strong>Tesoura entre dois muros: uma ponta desliza</strong><small>Furo oblongo na chapa: a tesoura não empurra o muro para fora.</small></span></label>}
        {walls > 0 && <Field label="Muros conferidos no local por (nome e data)"><Input value={sm.wallSiteReview} maxLength={300} placeholder="ex.: Tom, 20/11/2026 — cinta grauteada no topo"
          onChange={e => setModel({ wallSiteReview: e.target.value })} data-testid="truss-wall-review" /></Field>}
      </div>
      {engineeringPending && <p className={styles.muted}>Sem a conferência do muro, o cálculo estrutural fica bloqueado. A lista de materiais e o orçamento preliminar continuam valendo como não validados.</p>}
    </details>
  </section>;
}
