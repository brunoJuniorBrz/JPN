"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/domain/models";
import { generateStructure } from "@/domain/calculations/structure";
import { structureSignature } from "@/domain/calculations/project-basis";
import { mixedReferenceProject } from "@/domain/examples/mixed-project";
import { loadedMixedReferenceProject } from "@/domain/examples/loaded-mixed-project";
import { adaptMixedProject } from "@/domain/mixed-adapter";
import { mixedStations, verifyMixedResult } from "@/domain/mixed-analysis";
import { anyMixedResultSchema, verifyLoadingTrace } from "@/domain/structural-loading";
import { adaptLoadedMixedProject } from "@/domain/loaded-mixed-adapter";
import { StructuralLoadsPanel } from "./structural-loads-panel";
import { inspectConnectivity } from "@/domain/spatial-connectivity";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { Field, Input, Select } from "@/components/ui";
import { downloadText } from "@/lib/format";
import { SpatialPreparationPanel } from "./spatial-preparation-panel";
import { Structure3D } from "./structure-3d";

type Prepared = Awaited<ReturnType<typeof adaptMixedProject>> | Awaited<ReturnType<typeof adaptLoadedMixedProject>>;
type Session = { identity: string; prepared: Prepared; result: ReturnType<typeof anyMixedResultSchema.parse>; execution: unknown };
const show = (v: number) => v === 0 ? "0" : v.toExponential(5);
export function MixedAnalysisWorkspace({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const [example, setExample] = useState<Project | null>(null), [pane, setPane] = useState("prepare");
  const active = example ?? project, draft = active.workspace.spatialPreparation ?? newSpatialPreparation(active);
  const signature = structureSignature(active), identity = JSON.stringify([example ? "example" : "work", active.id, signature, draft]);
  const model = useMemo(() => generateStructure(active).model, [active]);
  const connectivity = useMemo(() => { try { return model ? { inspected: inspectConnectivity(model), error: "" } : { error: "Geometria incompleta." }; } catch (e) { return { error: (e as Error).message }; } }, [model]);
  const [source, setSource] = useState(""), [confirm, setConfirm] = useState(false);
  const [health, setHealth] = useState("Verificando executor Python…"), [ready, setReady] = useState(false);
  const [healthRevision, setHealthRevision] = useState(0);
  const [executionMode,setExecutionMode]=useState<"local"|"remote">("local");
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null), [error, setError] = useState("");
  const busy = busyIdentity === identity;
  const [session, setSession] = useState<Session | null>(null), [combo, setCombo] = useState(""), [pieceId, setPieceId] = useState(""), [segmentId, setSegmentId] = useState(""), [nodeId, setNodeId] = useState("");
  const request = useRef<AbortController | null>(null), ticket = useRef({ value: 0 });
  useEffect(() => { const state = ticket.current; state.value++; request.current?.abort(); return () => { state.value++; request.current?.abort(); }; }, [identity]);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      let out;
      for (let attempt = 0; attempt <= 9; attempt++) {
        const r = await fetch("/api/experimental/mixed3d", { headers:{"X-JPN-Request":"1"}, signal: controller.signal, cache: "no-store" }); out = await r.json();
        if (r.ok && out.status === "ready") break;
        // Remount/StrictMode or another legitimate request can occupy the
        // single-process gate. Back off for up to ~35 s instead of hammering
        // a cold-starting Python worker. Never bypass the concurrency guard.
        if (out.error?.code !== "BUSY" || attempt === 9) throw new Error(out.error?.message ?? "Executor indisponível.");
        setHealth("Executor ocupado por outra verificação; aguardando liberação automática…");
        await new Promise(resolve => setTimeout(resolve, Math.min(5000, 700 * 2 ** attempt)));
        if (controller.signal.aborted) return;
      }
      if (controller.signal.aborted) return;
      setExecutionMode(out.execution?.local_only===false?"remote":"local");setReady(true); setHealth(`Python ${out.dependencies.python} · PyNiteFEA ${out.dependencies.PyNiteFEA} · ${out.execution?.local_only===false?"serviço remoto autenticado":"processo local separado"} · 768 MiB · 20 s no solver · uma execução por instância.`);
    })().catch(e => { if (!controller.signal.aborted) setHealth(`${(e as Error).message} No modo local, inicie com pnpm dev:structural; no modo remoto, confira o acesso de operador e a configuração do servidor.`); });
    return () => controller.abort();
  }, [healthRevision]);
  function invalidate() { ticket.current.value++; request.current?.abort(); setSession(null); setBusyIdentity(null); setError(""); }
  function edit(patch: Partial<Project>) { invalidate(); if (example) setExample({ ...example, ...patch }); else onChange(patch); }
  function switchScope(next: Project | null) { invalidate(); setExample(next); setPane("prepare"); setPieceId(""); setSegmentId(""); setConfirm(false); setSource(""); }
  const current = session?.identity === identity ? session : null;
  const selectedCombo = current && (current.result.combinations[combo] ? combo : Object.keys(current.result.combinations)[0]);
  const result = current && selectedCombo ? current.result.combinations[selectedCombo] : null;
  const selectedPiece = model?.pieces.some(p => p.id === pieceId) ? pieceId : model?.pieces[0]?.id ?? "";
  const segments = current?.prepared.mapping.members.filter(m => m.originalId === selectedPiece) ?? [];
  const segment = segments.find(m => m.id === segmentId) ?? segments[0];
  const member = segment && result?.members[segment.id], stations = member ? mixedStations(member) : null;
  const selectedNode = result && result.nodes[nodeId] ? nodeId : segment?.start ?? "";
  const node = result?.nodes[selectedNode];
  const colors = useMemo(() => {
    if (!current || !result) return undefined;
    const values: Record<string, number> = {};
    for (const m of current.prepared.mapping.members) {
      const response = result.members[m.id], color = response.kind === "frame" ? 0x406b91 : response.axial_n > 1e-8 ? 0x27858f : response.axial_n < -1e-8 ? 0x8e639f : 0x7b8178;
      values[m.originalId] = values[m.originalId] === undefined || values[m.originalId] === color ? color : 0xb18b43;
    }
    return values;
  }, [current, result]);
  async function execute() {
    const controller = new AbortController(), mine = ++ticket.current.value; request.current?.abort(); request.current = controller;
    setBusyIdentity(identity); setError(""); setSession(null);
    const timeout = setTimeout(() => controller.abort(), 33000);
    try {
      const prepared = await (draft.loading ? adaptLoadedMixedProject(active) : adaptMixedProject(active)); if (controller.signal.aborted || ticket.current.value !== mine) return;
      const response = await fetch("/api/experimental/mixed3d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prepared.request), signal: controller.signal });
      const out = await response.json(); if (!response.ok) throw new Error(`${out.error?.code ?? response.status}: ${out.error?.message ?? "Análise recusada."}`);
      if (out.status !== "completed" || !((out.schema_version==="jpn.local-mixed/1"&&out.execution?.local_only===true)||(out.schema_version==="jpn.remote-mixed/1"&&out.execution?.local_only===false&&out.execution?.transport==="remote"))) throw new Error("Origem de execução incompatível.");
      const parsed = anyMixedResultSchema.parse(out.result); if(parsed.schema_version!==prepared.request.schema_version.replace("mixed3d/","mixed3d-result/"))throw new Error("Versão de resposta incompatível."); verifyMixedResult(prepared.request, parsed, prepared.input_sha256);
      verifyLoadingTrace(prepared.request,parsed);
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      setSession({ identity, prepared, result: parsed, execution: out.execution }); setCombo(Object.keys(parsed.combinations)[0]); setPane("results");
    } catch (e) { if (ticket.current.value === mine) setError(controller.signal.aborted ? "Execução cancelada ou prazo excedido; nenhum resultado publicado." : (e as Error).message); }
    finally { clearTimeout(timeout); if (ticket.current.value === mine) setBusyIdentity(null); }
  }
  function exportJSON(value: unknown, name: string) { downloadText(JSON.stringify(value, null, 2), name); }
  return <section aria-label="Análise Estrutural Experimental" data-testid="mixed-workspace" className="mixed-workspace">
    <h3>Análise Estrutural Experimental</h3>
    <p>Primeira ordem e elasticidade linear. Peso próprio somente quando ativado com densidades e gravidade declaradas. Sem dimensionamento resistente ou autorização para fabricar.</p>
    <div className="actions"><button className="button secondary" onClick={() => switchScope(mixedReferenceProject())}>Abrir exemplo misto independente</button><button className="button secondary" onClick={()=>switchScope(loadedMixedReferenceProject())}>Abrir exemplo de peso e cargas</button>{example && <button className="button secondary" onClick={() => switchScope(null)}>Voltar à obra</button>}</div>
    <p className="notice" data-testid="mixed-scope">{example ? "EXEMPLO SINTÉTICO INDEPENDENTE — 10 × 20 × 4 m. Pilares, banzos, terças e montantes são pórticos rígidos; 36 diagonais são axiais. 12 bases engastadas, propriedades e forças sintéticas explícitas. Não altera nem salva sua obra." : "OBRA ATUAL — somente suas declarações físicas. Dados ausentes ou modelos instáveis bloqueiam o cálculo."}</p>
    <p role="status" data-testid="mixed-health">{health}</p>
    <button className="button secondary" disabled={busy} onClick={() => { setReady(false); setHealth("Verificando Python…"); setHealthRevision(v => v + 1); }}>Verificar executor {ready ? (executionMode==="remote"?"remoto":"local") : ""}</button>
    <nav className="physical-prep-tabs" aria-label="Fluxo misto"><button className="button secondary" aria-pressed={pane === "prepare"} onClick={() => setPane("prepare")}>Preparação mista</button><button className="button secondary" aria-pressed={pane === "results"} onClick={() => setPane("results")}>Resultados 3D</button></nav>
    {pane === "prepare" && <>
      <SpatialPreparationPanel key={example ? "example" : "work"} project={active} onChange={edit} mixed />
      <StructuralLoadsPanel project={active} onChange={edit}/>
      <details className="technical-details"><summary>Conectividade física e segmentação</summary>
        <p>Conectar junta significa compartilhar translações e somente as rotações previstas pelo tipo e liberações declarados. Barras contínuas mantêm continuidade nos cortes internos. Contatos independentes exigem outro modelo e são recusados.</p>
        {connectivity.error && <p role="alert">{connectivity.error}</p>}
        <ul>{connectivity.inspected?.junctions.map(j => <li key={j.nodeId}>{j.nodeId}: {j.pieceIds.join(", ")}{j.interiorPieceIds.length ? ` · segmentar: ${j.interiorPieceIds.join(", ")}` : ""}</li>)}</ul>
        <p>Revisão registrada: {draft.connectivity?.reviewSource ?? "Pendente"}. {draft.connectivity?.geometrySignature === signature ? "Vínculo geométrico atual." : "Conectividade precisa ser revisada nesta geometria."}</p>
        <Field label="Fonte da revisão de conectividade"><Input value={source} maxLength={1000} onChange={e => setSource(e.target.value)} /></Field>
        <label className="checkbox-label"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />Revisei todas as juntas listadas e declaro que estão conectadas segundo os tipos e ligações informados.</label>
        <button className="button secondary" disabled={!confirm || !source.trim() || !connectivity.inspected} onClick={() => edit({ workspace: { ...active.workspace, spatialPreparation: { ...draft, connectivity: { version: 1, geometrySignature: signature, reviewSource: source, junctions: connectivity.inspected!.junctions.map(j => ({ nodeId: j.nodeId, pieceIds: j.pieceIds, decision: "connect" })) } } } })}>Registrar conectividade revisada</button>
      </details>
    </>}
    <div className="actions"><button className="button" disabled={!ready || busy} onClick={() => void execute()}>{busy ? "Executando Python…" : `Executar análise mista ${executionMode==="remote"?"online":"local"}`}</button>{busy && <button className="button secondary" onClick={invalidate}>Cancelar execução</button>}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {pane === "results" && <>
      {!current && <p className="notice" data-testid="mixed-no-results">Sem resultado atual. Execute após revisar os dados; alterações invalidam resultados anteriores.</p>}
      <Field label="Peça na análise mista"><Select value={selectedPiece} onChange={e => { setPieceId(e.target.value); setSegmentId(""); setNodeId(""); }}>{model?.pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}</Select></Field>
      {model && <div data-testid="mixed-viewer"><Structure3D model={model} roof={active.roof} planning={active.planning} projectName={active.name} selected={selectedPiece} onSelect={id => { setPieceId(id); setSegmentId(""); setNodeId(""); }} analysisColors={colors ?? {}} /></div>}
      <p>Legenda: pórtico azul; axial em tração turquesa; compressão violeta; nulo cinza; sinais diferentes entre segmentos ocre. Seleção laranja. Cores não verificam resistência.</p>
      {current && result && <div data-testid="mixed-results">
        <p>{current.prepared.request.nodes.length} nós · {new Set(current.prepared.mapping.members.map(m => m.originalId)).size} peças · {current.prepared.request.members.length} segmentos · {current.prepared.request.members.filter(m => m.kind === "axial").length} axiais.</p>
        {current.result.schema_version==="jpn.mixed3d-result/2" && <p data-testid="loaded-result-trace">{current.result.loading.self_weight ? `Peso próprio declarado: ${show(current.result.loading.self_weight.total_mass_kg)} kg · caso ${current.result.loading.self_weight.case}.` : "Peso próprio desativado."} {current.result.loading.member_loads.length} cargas uniformes manuais; sem duplicação automática.</p>}
        <Field label="Combinação mista"><Select value={selectedCombo ?? ""} onChange={e => setCombo(e.target.value)}>{Object.keys(current.result.combinations).map(id => <option key={id}>{id}</option>)}</Select></Field>
        <Field label="Segmento físico da peça"><Select value={segment?.id ?? ""} onChange={e => { setSegmentId(e.target.value); setNodeId(""); }}>{segments.map(m => <option key={m.id} value={m.id}>{m.id} ← {m.originalId} · {m.start} → {m.end}</option>)}</Select></Field>
        {member && segment && <div data-testid="mixed-selection" data-original-piece={selectedPiece} data-segment={segment.id} data-kind={member.kind}>
          <h4>{selectedPiece} → {segment.id} · {member.kind === "axial" ? "Barra exclusivamente axial" : "Pórtico Euler–Bernoulli"}</h4>
          <p data-testid="mixed-axial">N = {show((member.kind === "axial" ? member.axial_n : -member.end_actions_local[0]) / 1000)} kN · {(member.kind === "axial" ? member.axial_n : -member.end_actions_local[0]) > 1e-8 ? "tração" : (member.kind === "axial" ? member.axial_n : -member.end_actions_local[0]) < -1e-8 ? "compressão" : "aproximadamente nulo"} (+ tração / − compressão).</p>
          {stations ? <><p>Esforços locais incluindo cargas distribuídas quando declaradas. Cinco estações amostradas; não são envelopes de resistência.</p><ul>{stations.map(s => <li key={s.x_m}>x={show(s.x_m)} m · N/Vy/Vz (kN): {[s.n_n, s.vy_n, s.vz_n].map(v => show(v / 1000)).join("; ")} · T/My/Mz (kN·m): {[s.t_nm, s.my_nm, s.mz_nm].map(v => show(v / 1000)).join("; ")}{s.translation_local_m && ` · deslocamento local XYZ (mm): ${s.translation_local_m.map(v=>show(v*1000)).join("; ")}`}</li>)}</ul></> : <p>Flexão, cortantes, torção e rotações da barra não participam da formulação axial. Nenhum valor de flexão foi inventado.</p>}
          <p>Rastreabilidade: {segment.start} → {segment.end}; intervalo original [{segment.t0}, {segment.t1}]; comprimento {show(segment.lengthMm / 1000)} m.</p>
        </div>}
        <Field label="Nó do resultado misto"><Select value={selectedNode} onChange={e => setNodeId(e.target.value)}>{current.prepared.request.nodes.map(n => <option key={n.id}>{n.id}</option>)}</Select></Field>
        {node && <ul data-testid="mixed-node"><li>Translações XYZ (mm): {node.translation_m.map(v => show(v * 1000)).join("; ")}</li><li>{node.active_rotations ? `Rotações XYZ (rad): ${node.rotation_rad.map(show).join("; ")}` : "Rotações inativas: nó exclusivamente axial, sem vínculos ou rigidez rotacional artificiais."}</li><li>{current.prepared.request.supports.some(s => s.node === selectedNode) ? "Reações no apoio" : "Resíduo nodal (não é apoio)"} XYZ (kN): {node.reaction_force_n.map(v => show(v / 1000)).join("; ")}</li><li>{node.active_rotations ? `Momentos de reação/resíduo XYZ (kN·m): ${node.reaction_moment_nm.map(v => show(v / 1000)).join("; ")}` : "Momentos de reação não aplicáveis ao nó axial."}</li></ul>}
        <p>Equilíbrio global: resíduo relativo {show(result.equilibrium.relative_residual)}; forças XYZ (N) {result.equilibrium.force_n.map(show).join("; ")}; momentos XYZ (N·m) {result.equilibrium.moment_nm.map(show).join("; ")}. O motor também verifica equilíbrio nodal antes de publicar.</p>
        <p>{current.result.diagnostics.free_dofs} graus livres · condição escalada {show(current.result.diagnostics.scaled_condition)} · {show(current.result.diagnostics.elapsed_seconds)} s.</p>
        <details><summary>Hipóteses e limites do cálculo</summary><ul>{current.result.assumptions.map(a => <li key={a}>{a}</li>)}</ul><p>Geometria original preservada. Deformada gráfica ainda não implementada. Juntas esféricas nas duas extremidades de pórticos e contatos independentes permanecem recusados.</p></details>
        <div className="actions"><button className="button secondary" onClick={() => exportJSON(current.prepared, "jpn-misto-entradas-rastreabilidade.json")}>Exportar entradas mistas</button><button className="button secondary" onClick={() => exportJSON({ prepared: current.prepared, result: current.result, execution: current.execution }, "jpn-misto-resultados-rastreabilidade.json")}>Exportar resultados mistos</button></div>
      </div>}
    </>}
  </section>;
}
