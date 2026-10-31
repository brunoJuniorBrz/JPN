"use client";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/domain/models";
import { spatialInputHash, spatialRequestSchema, spatialResultSchema, canonicalSpatialInput, type SpatialResult } from "@/domain/spatial-analysis";
import { buildSpatialRequest, spatialReadiness } from "@/domain/spatial-readiness";
import { structureSignature } from "@/domain/calculations/project-basis";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { downloadText } from "@/lib/format";
import example from "../../../engine/examples/spatial-portal.json";

const dofs = ["UX", "UY", "UZ", "RX", "RY", "RZ"];
const display = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
export function SpatialAnalysisPanel({ project }: { project: Project }) {
  const [text, setText] = useState(""), [scope, setScope] = useState("independent"), [connections, setConnections] = useState(""), [lateral, setLateral] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [state, setState] = useState<{ identity: string; result: SpatialResult } | null>(null);
  const [combination, setCombination] = useState(""), [member, setMember] = useState("");
  const [bindingBasis, setBindingBasis] = useState("");
  const signature = structureSignature(project);
  let parsed: ReturnType<typeof spatialRequestSchema.safeParse> | null = null;
  try { parsed = spatialRequestSchema.safeParse(JSON.parse(text)); } catch {}
  const bindingIdentity = JSON.stringify({ signature, connections, lateral });
  const bindingStale = scope === "project" && bindingBasis !== bindingIdentity;
  const readiness = spatialReadiness(project, scope === "project" && !bindingStale && parsed?.success ? parsed.data : undefined, { connections, lateralSystem: lateral });
  const identity = canonicalSpatialInput({ model: parsed?.success ? parsed.data : text, signature, scope, connections, lateral });
  const latest = useRef(identity), abort = useRef<AbortController | null>(null);
  useEffect(() => { latest.current = identity; }, [identity]);
  useEffect(() => () => abort.current?.abort(), []);
  const current = state?.identity === identity ? state.result : null;
  const activeCombination = current?.combinations[combination] ? combination : Object.keys(current?.combinations ?? {})[0];
  const result = current?.combinations[activeCombination];
  const activeMember = result?.members[member] ? member : Object.keys(result?.members ?? {})[0];
  const edit = (value: string) => { latest.current = ""; setText(value); setError(""); };
  async function bind() {
    setError("");
    try { if (!parsed?.success) throw new Error("Revise o JSON antes de vincular."); const request = await buildSpatialRequest(project, parsed.data, { connections, lateralSystem: lateral }); edit(JSON.stringify(request, null, 2)); setBindingBasis(bindingIdentity); setScope("project"); }
    catch (e) { setError(`Modelo da obra bloqueado: ${(e as Error).message}`); }
  }
  async function run() {
    if (!parsed?.success || bindingStale) return;
    const request = parsed.data, basis = identity;
    setBusy(true); setError(""); setState(null); abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 25000);
    try {
      const expectedHash = await spatialInputHash(request);
      const response = await fetch("/api/analysis3d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: abort.current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error?.code ?? "ERRO"}: ${data.error?.message ?? "Análise recusada."}`);
      const output = spatialResultSchema.parse(data);
      if (output.input_sha256 !== expectedHash) throw new Error("INVALID_RESPONSE: hash incompatível com as entradas.");
      if (latest.current !== basis) throw new Error("Modelo alterado durante a análise: resultado descartado.");
      setState({ identity: basis, result: output });
    } catch (e) { setError((e as Error).name === "AbortError" ? "TIMEOUT: consulta interrompida, sem resultado publicado." : (e as Error).message); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <section className="technical-review" aria-label="Análise 3D experimental">
    <h3>Análise estrutural 3D experimental</h3>
    <p>Modelo visual pronto e modelo físico apto para análise são estados distintos. Primeira ordem, materiais isotrópicos e barras de pórtico Euler–Bernoulli. Não verifica resistência, flambagem, normas ou fabricação.</p>
    <div className="notice" data-testid="spatial-readiness"><strong>{readiness.visual_ready ? "Modelo visual pronto" : "Geometria visual pendente"} · {readiness.analysis_ready ? "Modelo físico declarado: pronto para análise experimental" : "Faltam dados para análise desta obra"}</strong><p>A cobertura não será convertida automaticamente em pórticos rígidos.</p>
      <details><summary>Pendências da obra · {readiness.issues.length} diagnósticos</summary><ul>{readiness.issues.map((issue, i) => <li key={`${issue.code}-${i}`}><strong>{issue.code}</strong>: {issue.message}</li>)}</ul></details>
    </div>
    <button type="button" className="button secondary" onClick={() => { setScope("fixture"); edit(JSON.stringify(example, null, 2)); setState(null); }}>Carregar exemplo espacial validado</button>
    <p className="field-hint">Exemplo independente de cinco nós e quatro barras, com dois engastes e forças/momentos declarados. Dimensões e propriedades sintéticas de validação; não substitui dados da sua obra.</p>
    {text && <>
      <p className="notice"><strong>{scope === "fixture" ? "EXEMPLO DE VALIDAÇÃO · NÃO É A ANÁLISE DESTA COBERTURA" : scope === "project" ? "Modelo físico vinculado à geometria revisada" : "Modelo físico explícito independente"}</strong></p>
      <details open><summary>Revisar e editar modelo físico · SI</summary>
        <p>Global Z para cima. Coordenadas m; forças N; momentos N·m; E/G Pa; A m²; Iy/Iz/J m⁴. Apoios e liberações na ordem UX/UY/UZ/RX/RY/RZ. Apenas cargas nodais; não há peso próprio ou vento presumido.</p>
        <Field label="Entrada do modelo físico 3D (JSON SI)"><Textarea value={text} maxLength={500000} rows={12} onChange={e => { setScope("independent"); edit(e.target.value); }} /></Field>
        {parsed?.success && <>
          <p>{parsed.data.nodes.length} nós · {parsed.data.members.length} barras · casos {parsed.data.cases.map(c => c.id).join(", ")} · combinações {parsed.data.combinations.map(c => `${c.id}: ${JSON.stringify(c.factors)}`).join("; ")}</p>
          <ul>{parsed.data.supports.map(s => <li key={s.node}>Apoio {s.node}: {dofs.map((d, i) => `${d} ${s.restrained[i] ? "fixo em zero" : "livre"}`).join(" · ")}</li>)}</ul>
          <ul>{parsed.data.materials.map(m => <li key={m.id}>{m.id}: E {display(m.e_pa / 1e9)} GPa; G {display(m.g_pa / 1e9)} GPa; ν {m.nu}. Fonte: {m.source} · revisão {m.revision}</li>)}</ul>
          <button type="button" className="button secondary" onClick={() => downloadText(JSON.stringify(parsed.data, null, 2), "jpn-frame3d-input.json")}>Exportar entradas 3D em JSON</button>
        </>}
      </details>
      {!parsed?.success && <p role="alert" className="field-error">INVALID_INPUT: modelo incompleto ou JSON inválido. Confira campos, referências, fontes e combinações; nenhuma propriedade é preenchida automaticamente.</p>}
      <details><summary>Vincular modelo explícito à obra · revisão técnica</summary><p>Exige mesmos IDs, conectividade e segmentação resolvida. Contatos internos bloqueiam a conversão; os apoios, liberações e propriedades devem vir do JSON revisado.</p>
        <Field label="Revisão das ligações"><Input value={connections} maxLength={300} onChange={e => setConnections(e.target.value)} /></Field>
        <Field label="Sistema de estabilidade lateral declarado"><Input value={lateral} maxLength={300} onChange={e => setLateral(e.target.value)} /></Field>
        <button type="button" className="button secondary" onClick={() => void bind()}>Vincular JSON revisado a esta obra</button>
      </details>
      {bindingStale && <p role="status" className="notice">Geometria ou revisão técnica alterada: vincule o JSON novamente antes de analisar.</p>}
      <button type="button" className="button" disabled={busy || !parsed?.success || bindingStale} onClick={() => void run()}>{busy ? "Analisando modelo 3D…" : "Executar análise 3D experimental"}</button>
      <p className="field-hint">Rascunho e resultados transitórios, separados dos backups e da análise 2D. Exporte o JSON para preservar as condições declaradas; recarregar exige nova análise.</p>
    </>}
    {error && <p role="alert" className="field-error">{error.includes("UNAVAILABLE") ? "Serviço de análise indisponível" : "Instabilidade/erro"}: {error}</p>}
    {state && !current && <p role="status" className="notice">Modelo alterado: resultado desatualizado. Execute novamente; a resposta anterior não é atual.</p>}
    {current && result && <div data-testid="spatial-results"><h4>Análise experimental executada</h4>
      <p style={{ overflowWrap: "anywhere" }}>Modelo {current.project.id} · revisão {current.project.revision} · {current.solver.name} {current.solver.version}. {current.project.source}</p>
      <p className="hash-label">SHA-256 de todas as entradas: {current.input_sha256}</p>
      <Field label="Combinação 3D exibida"><Select value={activeCombination} onChange={e => setCombination(e.target.value)}>{Object.keys(current.combinations).map(id => <option key={id}>{id}</option>)}</Select></Field>
      <h4>Deslocamentos e rotações globais</h4><div className="takeoff-table-scroll" tabIndex={0}><table className="takeoff-table"><thead><tr>{["Nó", "Ux (mm)", "Uy (mm)", "Uz (mm)", "Rx (rad)", "Ry (rad)", "Rz (rad)"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{Object.entries(result.nodes).map(([id, n]) => <tr key={id}><td>{id}</td>{n.translation_m.map((v, i) => <td key={i}>{display(v * 1000)}</td>)}{n.rotation_rad.map((v, i) => <td key={i}>{v.toExponential(4)}</td>)}</tr>)}</tbody></table></div>
      <h4>Reações globais dos apoios</h4><div className="takeoff-table-scroll" tabIndex={0}><table className="takeoff-table"><thead><tr>{["Nó", "Fx (kN)", "Fy (kN)", "Fz (kN)", "Mx (kN·m)", "My (kN·m)", "Mz (kN·m)"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{Object.entries(result.nodes).map(([id, n]) => <tr key={id}><td>{id}</td>{[...n.force_n, ...n.moment_nm].map((v, i) => <td key={i}>{display(v / 1000)}</td>)}</tr>)}</tbody></table></div>
      <Field label="Barra para consultar esforços 3D"><Select value={activeMember} onChange={e => setMember(e.target.value)}>{Object.keys(result.members).map(id => <option key={id}>{id}</option>)}</Select></Field>
      <p className="field-hint">Seção: ação da parte final sobre a parte inicial. N positivo em tração; Vy/Vz nos eixos locais; T/My/Mz pela mão direita. Eixos físicos distintos da orientação visual dos perfis.</p>
      <div className="takeoff-table-scroll" tabIndex={0}><table className="takeoff-table"><thead><tr>{["x (m)", "N (kN)", "Vy (kN)", "Vz (kN)", "T (kN·m)", "My (kN·m)", "Mz (kN·m)"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{result.members[activeMember].stations.map((s, i) => <tr key={i}><td>{display(s.x_m)}</td>{[s.n_n, s.vy_n, s.vz_n, s.t_nm, s.my_nm, s.mz_nm].map((v, k) => <td key={k}>{display(v / 1000)}</td>)}</tr>)}</tbody></table></div>
      <details><summary>Diagnóstico, eixos locais e hipóteses</summary><p>Condição escalada: {current.diagnostics.scaled_condition.toExponential(4)} · {current.diagnostics.free_dofs} graus livres · {display(current.diagnostics.elapsed_seconds)} s</p><p>Resíduo relativo de equilíbrio: {result.equilibrium.relative_residual.toExponential(4)}</p><p>Eixos locais XYZ, linhas expressas no global: {JSON.stringify(result.members[activeMember].local_axes)}</p><ul>{current.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
      <button type="button" className="button secondary" onClick={() => downloadText(JSON.stringify(current, null, 2), "jpn-frame3d-result.json")}>Exportar resultado experimental em JSON</button>
    </div>}
  </section>;
}
