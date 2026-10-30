"use client";
import { useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Project } from "@/domain/models";
import { buildTrussRequest, trussGeometry, trussResultSchema, type TrussResult } from "@/domain/analysis";
import { structureSignature } from "@/domain/calculations/project-basis";
import { formatMeasure } from "@/domain/calculations/units";

function ForceField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  const valid = /^-?\d+(?:[.,]\d+)?$/.test(text.trim()) && Number.isFinite(Number(text.replace(",", ".")));
  return <Field label={label} error={text && !valid ? "Informe força com sinal e unidade kN." : undefined}><Input inputMode="text" value={text} aria-invalid={!valid} onChange={e => { const t = e.target.value; setText(t); const n = Number(t.replace(",", ".")); onChange(/^-?\d+(?:[.,]\d+)?$/.test(t.trim()) && Number.isFinite(n) ? n : null); }} /></Field>;
}
export function AnalysisPanel({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const signature = structureSignature(project), config = project.workspace.analysis;
  const identity = JSON.stringify({ signature, config }), latest = useRef(identity);
  useEffect(() => { latest.current = identity; }, [identity]);
  const [state, setState] = useState<{ identity: string; result: TrussResult } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  let geometry: ReturnType<typeof trussGeometry> | null = null, unavailable = "";
  try { geometry = trussGeometry(project); } catch (e) { unavailable = (e as Error).message; }
  const nodes = geometry?.nodes ?? [];
  const update = (value: NonNullable<typeof config>) => onChange({ workspace: { ...project.workspace, analysis: value } });
  const current = state?.identity === identity ? state.result : null;
  async function run() {
    setBusy(true); setError(""); setState(null);
    try {
      const request = buildTrussRequest(project), basis = identity;
      const response = await fetch("/api/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error?.code ?? "ERRO"}: ${data.error?.message ?? "Não foi possível analisar."}`);
      if (latest.current !== basis) throw new Error("Modelo alterado durante a análise. Resultado descartado; execute novamente.");
      setState({ identity: basis, result: trussResultSchema.parse(data) });
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao consultar o solver."); }
    finally { setBusy(false); }
  }
  return <section className="technical-review"><h3>Análise experimental de uma tesoura isolada</h3><p>Somente barras T1 em plano vertical. Pilares, terças, balanços e estabilidade espacial da cobertura não participam. Cargas devem chegar aos nós explicitamente; nenhuma carga, apoio ou peso próprio é presumido.</p>
    {unavailable ? <p className="notice">{unavailable}</p> : <button className="button secondary" onClick={() => { setState(null); setError(""); update({ signature, supports: [], loads: [], articulated: false }); }}>{config ? "Reconfigurar nós e limpar cargas/apoios" : "Configurar tesoura isolada"}</button>}
    {config && config.signature !== signature && <p className="pending-box" role="status">Geometria ou perfis alterados. Cargas e apoios anteriores foram preservados, mas não podem ser usados até reconfigurar o modelo.</p>}
    {config && config.signature === signature && <>
      <label className="checkbox-label"><input type="checkbox" checked={config.articulated} onChange={e => update({ ...config, articulated: e.target.checked })} />Hipótese declarada: tesoura isolada articulada, forças aplicadas somente nos nós.</label>
      <details><summary>Coordenadas dos nós da tesoura (mm)</summary><ul>{nodes.map(n => <li key={n.id}>{n.id}: horizontal {formatMeasure(n.xMm)} mm; vertical {formatMeasure(n.yMm)} mm</li>)}</ul></details>
      <h4>Condições de apoio</h4>
      {config.supports.map((s, i) => <div className="estimate-line" key={`${i}-${s.node}`}><Field label={`Nó do apoio ${i + 1}`}><Select value={s.node} onChange={e => update({ ...config, supports: config.supports.map((v, k) => k === i ? { ...v, node: e.target.value } : v) })}>{nodes.map(n => <option key={n.id}>{n.id}</option>)}</Select></Field>{([["uxMm", "horizontal"], ["uyMm", "vertical"]] as const).map(([key, label]) => <label key={key} className="checkbox-label"><input type="checkbox" checked={s[key] !== null} onChange={e => update({ ...config, supports: config.supports.map((v, k) => k === i ? { ...v, [key]: e.target.checked ? 0 : null } : v) })} />Restringir deslocamento {label} em zero</label>)}<button className="button secondary" onClick={() => update({ ...config, supports: config.supports.filter((_, k) => k !== i) })}>Remover apoio {i + 1}</button></div>)}
      <button className="button secondary" disabled={!nodes.length || config.supports.length >= 200} onClick={() => update({ ...config, supports: [...config.supports, { node: nodes[0].id, uxMm: null, uyMm: null }] })}>Adicionar apoio da tesoura</button>
      <h4>Cargas nodais · +horizontal para a direita, +vertical para cima</h4>
      {config.loads.map((load, i) => <div className="estimate-line" key={`${i}-${load.node}`}><Field label={`Nó da carga ${i + 1}`}><Select value={load.node} onChange={e => update({ ...config, loads: config.loads.map((v, k) => k === i ? { ...v, node: e.target.value } : v) })}>{nodes.map(n => <option key={n.id}>{n.id}</option>)}</Select></Field><div className="form-grid">{(["fxKn", "fyKn"] as const).map(key => <ForceField key={key} label={`${key === "fxKn" ? "Fx" : "Fy"} da carga ${i + 1} (kN)`} value={load[key]} onChange={value => update({ ...config, loads: config.loads.map((v, k) => k === i ? { ...v, [key]: value } : v) })} />)}</div><button className="button secondary" onClick={() => update({ ...config, loads: config.loads.filter((_, k) => k !== i) })}>Remover carga {i + 1}</button></div>)}
      <button className="button secondary" disabled={!nodes.length || config.loads.length >= 1000} onClick={() => update({ ...config, loads: [...config.loads, { node: nodes[0].id, fxKn: null, fyKn: null }] })}>Adicionar carga nodal</button>
      <p className="notice">E em GPa e área em cm² devem estar informados nos perfis dos banzos e montantes, com fonte e data. O adaptador converte para Pa, m², m e N. Não há verificação normativa.</p>
      <button className="button" disabled={busy || !config.articulated} onClick={() => void run()}>{busy ? "Analisando…" : "Executar análise experimental"}</button>
    </>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {state && !current && <p role="status" className="notice">Resultado anterior desatualizado: execute novamente para estas entradas.</p>}
    {current && <div data-testid="analysis-results"><h4>Esforços e deslocamentos calculados · não é aprovação estrutural</h4><p>Motor {current.solver.version} · NumPy {current.solver.numpy} · SciPy {current.solver.scipy}</p><p className="hash-label">SHA-256 das entradas: {current.input_sha256}</p>
      <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Nó</th><th>Ux (mm)</th><th>Uy (mm)</th><th>Rx (kN)</th><th>Ry (kN)</th></tr></thead><tbody>{Object.entries(current.nodes).map(([id, n]) => <tr key={id}><td>{id}</td><td>{formatMeasure(n.ux_m * 1000, 6)}</td><td>{formatMeasure(n.uy_m * 1000, 6)}</td><td>{formatMeasure(n.rx_n / 1000, 6)}</td><td>{formatMeasure(n.ry_n / 1000, 6)}</td></tr>)}</tbody></table></div>
      <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Barra</th><th>Axial (kN)</th><th>Estado pelo sinal</th></tr></thead><tbody>{Object.entries(current.members).map(([id, m]) => <tr key={id}><td>{id}</td><td>{formatMeasure(m.axial_n / 1000, 6)}</td><td>{m.axial_n > 1e-6 ? "Tração" : m.axial_n < -1e-6 ? "Compressão" : "Próximo de zero"}</td></tr>)}</tbody></table></div><details><summary>Hipóteses e diagnóstico</summary><ul>{current.assumptions.map(a => <li key={a}>{a}</li>)}</ul><p>Resíduo nodal relativo: {current.diagnostics.nodal_residual_relative.toExponential(3)}</p></details>
    </div>}
  </section>;
}
