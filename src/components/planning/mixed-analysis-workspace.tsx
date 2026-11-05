"use client";
import { ConnectionsPanel } from "./connections-panel";
import { buildConnectionReport, assertConnectionReportCurrent, type ConnectionReport } from "@/domain/connection-report";
import { jointActionTraceSchema, type JointActionTrace } from "@/domain/member-end-actions";
import { stabilityFailureExplanation } from "@/domain/connection-declaration";
import { ResistanceReportPanel } from "./resistance-report-panel";
import { buildResistanceReport, assertResistanceReportCurrent, type ResistanceReport } from "@/domain/resistance-report";
import { buildResistanceAssessment,type MemberExecution } from "@/domain/resistance-assessment";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/domain/models";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { restoreMixedAnalysis } from "@/domain/restore-mixed-analysis";
import type { StructureModel } from "@/domain/structure";
import { structureSignature } from "@/domain/calculations/project-basis";
import { windReferenceProject } from "@/domain/examples/wind-project";
import { roofAreaReferenceProject } from "@/domain/examples/roof-area-project";
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
import { PhysicalLineView } from "./physical-line-view";

type Prepared = Awaited<ReturnType<typeof adaptMixedProject>> | Awaited<ReturnType<typeof adaptLoadedMixedProject>>;
type Session = { identity: string; prepared: Prepared; result: ReturnType<typeof anyMixedResultSchema.parse>; execution: unknown; resistance: ResistanceReport | null; resistanceError: string; connections: ConnectionReport | null; connectionError: string; jointActions: JointActionTrace | null;designExecutions?:MemberExecution[] };
const show = (v: number) => v === 0 ? "0" : v.toExponential(5);
export function MixedAnalysisWorkspace({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const [example, setExample] = useState<Project | null>(null), [pane, setPane] = useState("prepare");
  const active = example ?? project, draft = active.workspace.spatialPreparation ?? newSpatialPreparation(active);
  const signature = structureSignature(active), identity = JSON.stringify([example ? "example" : "work", active.id, signature, draft]);
  const model = useMemo(() => resolvePhysicalStructure(active).model, [active]);
  const [restored,setRestored]=useState(false);
  const connectivity = useMemo(() => { try { return model ? { inspected: inspectConnectivity(model), error: "" } : { error: "Geometria incompleta." }; } catch (e) { return { error: (e as Error).message }; } }, [model]);
  const [connectionNodeId,setConnectionNodeId]=useState(""),[inspectNodes,setInspectNodes]=useState(false);
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
  function invalidate(clear=true) { ticket.current.value++; request.current?.abort(); if(clear)setSession(null); setBusyIdentity(null); setError(""); }
  function edit(patch: Partial<Project>) { invalidate(false); if (example) setExample({ ...example, ...patch }); else onChange(patch); }
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
  async function execute(includeConnections=false) {
    const controller = new AbortController(), mine = ++ticket.current.value; request.current?.abort(); request.current = controller;
    setBusyIdentity(identity); setError(""); setSession(null);setRestored(false);
    const timeout = setTimeout(() => controller.abort(), 33000);
    try {
      const prepared = await (draft.loading ? adaptLoadedMixedProject(active) : adaptMixedProject(active)); if (controller.signal.aborted || ticket.current.value !== mine) return;
      const response = await fetch("/api/experimental/mixed3d", { method: "POST", headers: { "Content-Type": "application/json", ...(includeConnections?{"X-JPN-Joint-Actions":"1"}:{}) }, body: JSON.stringify(prepared.request), signal: controller.signal });
      const out = await response.json(); if (!response.ok) throw new Error(`${out.error?.code ?? response.status}: ${out.error?.message ?? "Análise recusada."}`);
      if (out.status !== "completed" || !((out.schema_version==="jpn.local-mixed/1"&&out.execution?.local_only===true)||(out.schema_version==="jpn.remote-mixed/1"&&out.execution?.local_only===false&&out.execution?.transport==="remote"))) throw new Error("Origem de execução incompatível.");
      const parsed = anyMixedResultSchema.parse(out.result); if(parsed.schema_version!==prepared.request.schema_version.replace("mixed3d/","mixed3d-result/"))throw new Error("Versão de resposta incompatível."); verifyMixedResult(prepared.request, parsed, prepared.input_sha256);
      verifyLoadingTrace(prepared.request,parsed);
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      let resistance: ResistanceReport | null = null, resistanceError = "";
      try { resistance = await buildResistanceReport(active, prepared, parsed,includeConnections?out.joint_actions:undefined); } catch(e) { resistanceError = (e as Error).message; }
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      let connections: ConnectionReport | null = null, connectionError = "", jointActions: JointActionTrace | null = null;
      if(includeConnections){try{jointActions=jointActionTraceSchema.parse(out.joint_actions);connections=await buildConnectionReport(active,prepared,parsed,jointActions);}catch(e){connectionError=(e as Error).message;}}
      if(controller.signal.aborted||ticket.current.value!==mine)return;
      if(!prepared.request.nodes.some(n=>n.id===connectionNodeId))setConnectionNodeId(prepared.request.nodes[0].id);
      setSession({ identity, prepared, result: parsed, execution: out.execution, resistance, resistanceError, connections, connectionError, jointActions }); setCombo(Object.keys(parsed.combinations)[0]); setPane("results");
    } catch (e) { if (ticket.current.value === mine) setError(controller.signal.aborted ? "Execução cancelada ou prazo excedido; nenhum resultado publicado." : (e as Error).message); }
    finally { clearTimeout(timeout); if (ticket.current.value === mine) setBusyIdentity(null); }
  }
  function exportJSON(value: unknown, name: string) { downloadText(JSON.stringify(value, null, 2), name); }
  async function restore(file:File){
    const mine=++ticket.current.value;request.current?.abort();setError("");
    try{
      if(file.size>5*1024*1024)throw Error("Resultado excede 5 MB.");
      const loaded=await restoreMixedAnalysis(active,await file.text());
      const resistance=await buildResistanceReport(active,loaded.prepared,loaded.result);
      if(ticket.current.value!==mine)return;
      setSession({identity,prepared:loaded.prepared,result:loaded.result,execution:loaded.execution,resistance,resistanceError:"",connections:null,connectionError:"",jointActions:null});setRestored(true);setPane("results");setCombo(Object.keys(loaded.result.combinations)[0]);
    }catch(e){if(ticket.current.value===mine)setError(`Resultado não restaurado: ${e instanceof Error?e.message:"arquivo inválido"}`);}
  }
  async function exportResistance(){
    if(!current?.resistance)return;const mine=ticket.current.value;
    try{
      await assertResistanceReportCurrent(current.resistance,active,current.prepared,current.result,current.jointActions??undefined);
      const assessment=await buildResistanceAssessment(active,current.resistance,current.designExecutions??[]);
      if(ticket.current.value===mine)exportJSON(assessment,"jpn-relatorio-resistente-preliminar.json");
    }catch(e){if(ticket.current.value===mine)setError((e as Error).message);}
  }
  return <section aria-label="Análise Estrutural Experimental" data-testid="mixed-workspace" className="mixed-workspace">
    <h3>Análise Estrutural Experimental</h3>
    <p>Primeira ordem e elasticidade linear. Peso próprio somente quando ativado com densidades e gravidade declaradas. Sem dimensionamento resistente ou autorização para fabricar.</p>
    <div className="actions"><button className="button secondary" onClick={() => switchScope(mixedReferenceProject())}>Abrir exemplo misto independente</button><button className="button secondary" onClick={()=>switchScope(loadedMixedReferenceProject())}>Abrir exemplo de peso e cargas</button><button className="button secondary" onClick={()=>switchScope(roofAreaReferenceProject())}>Abrir exemplo de ações por área</button><button className="button secondary" onClick={()=>switchScope(windReferenceProject())}>Abrir exemplo de vento zonal</button>{example && <button className="button secondary" onClick={() => switchScope(null)}>Voltar à obra</button>}</div>
    <p className="notice" data-testid="mixed-scope">{example ? "EXEMPLO SINTÉTICO INDEPENDENTE — 10 × 20 × 4 m. Pilares, banzos, terças e montantes são pórticos rígidos; 36 diagonais são axiais. 12 bases engastadas, propriedades e forças sintéticas explícitas. Não altera nem salva sua obra." : "OBRA ATUAL — somente suas declarações físicas. Dados ausentes ou modelos instáveis bloqueiam o cálculo."}</p>
    <p role="status" data-testid="mixed-health">{health}</p>
    {session&&!current&&<p role="status" className="notice" data-testid="mixed-stale">Resultado obsoleto: os dados físicos mudaram. Execute novamente; nenhum resultado anterior será usado.</p>}
    {current&&<p role="status" data-testid="mixed-result-state">{restored?"Resultado restaurado de arquivo; origem numérica não comprovada nesta sessão. Execute novamente para recalcular.":"Resultado calculado pelo executor para esta revisão."} Fabricação bloqueada.</p>}
    <details className="technical-details"><summary>Recuperar resultado exportado</summary><p>O arquivo deve corresponder exatamente ao projeto atual, suas propriedades e revisão. Restaurar um arquivo não comprova sua origem numérica nem aprova a estrutura.</p><label>Resultado misto JSON<input type="file" accept=".json,application/json" aria-label="Restaurar resultado misto JSON" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void restore(file);}}/></label></details>
    <button className="button secondary" disabled={busy} onClick={() => { setReady(false); setHealth("Verificando Python…"); setHealthRevision(v => v + 1); }}>Verificar executor {ready ? (executionMode==="remote"?"remoto":"local") : ""}</button>
    <nav className="physical-prep-tabs" aria-label="Fluxo misto"><button className="button secondary" aria-pressed={pane === "prepare"} onClick={() => setPane("prepare")}>Preparação mista</button><button className="button secondary" aria-pressed={pane === "results"} onClick={() => setPane("results")}>Resultados 3D</button></nav>
    {pane === "prepare" && <>
      <SpatialPreparationPanel key={example ? "example" : "work"} project={active} onChange={edit} mixed />
      <StructuralLoadsPanel project={active} onChange={edit} onSelectPiece={id=>{setPieceId(id);setSegmentId("");setNodeId("");setPane("results");}}/>
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
    <div className="actions"><button className="button secondary" disabled={!ready||busy} onClick={()=>void execute(true)}>Calcular ações de ligações</button><button className="button" disabled={!ready || busy} onClick={() => void execute()}>{busy ? "Executando Python…" : `Executar análise mista ${executionMode==="remote"?"online":"local"}`}</button>{busy && <button className="button secondary" onClick={()=>invalidate()}>Cancelar execução</button>}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {error&&stabilityFailureExplanation(error.split(":")[0])&&<p data-testid="connection-stability-failure">{stabilityFailureExplanation(error.split(":")[0])}</p>}
    {pane === "results" && <>
      {!current && <p className="notice" data-testid="mixed-no-results">Sem resultado atual. Execute após revisar os dados; alterações invalidam resultados anteriores.</p>}
      <Field label="Peça na análise mista"><Select value={selectedPiece} onChange={e => { setPieceId(e.target.value); setSegmentId(""); setNodeId(""); }}>{model?.pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}</Select></Field>
      <label className="checkbox-label"><input type="checkbox" checked={inspectNodes} onChange={e=>setInspectNodes(e.target.checked)}/>Selecionar nós físicos no 3D</label>
      {model && <div data-testid="mixed-viewer">{active.workspace.physicalStructure?<PhysicalLineView model={model} selected={selectedPiece} onSelect={id=>{setPieceId(id);setSegmentId("");}} selectedNodeId={connectionNodeId} onSelectNode={id=>{setConnectionNodeId(id);setNodeId(id);}}/>:<Structure3D inspectNodes={inspectNodes} selectedNodeId={connectionNodeId} onSelectNode={id=>{setConnectionNodeId(id);setNodeId(id);}} model={model as StructureModel} roof={active.roof} planning={active.planning} projectName={active.name} selected={selectedPiece} onSelect={id => { setPieceId(id); setSegmentId(""); setNodeId(""); }} analysisColors={colors ?? {}} />}</div>}
      <p>Legenda: pórtico azul; axial em tração turquesa; compressão violeta; nulo cinza; sinais diferentes entre segmentos ocre. Seleção laranja. Cores não verificam resistência.</p>
      {current && result && <div data-testid="mixed-results">
        <p>{current.prepared.request.nodes.length} nós · {new Set(current.prepared.mapping.members.map(m => m.originalId)).size} peças · {current.prepared.request.members.length} segmentos · {current.prepared.request.members.filter(m => m.kind === "axial").length} axiais.</p>
        {current.result.schema_version==="jpn.mixed3d-result/2" && <p data-testid="loaded-result-trace">{current.result.loading.self_weight ? `Peso próprio declarado: ${show(current.result.loading.self_weight.total_mass_kg)} kg · caso ${current.result.loading.self_weight.case}.` : "Peso próprio desativado."} {current.result.loading.member_loads.length} cargas distribuídas físicas; sem duplicação automática.</p>}
        {"roof_load_path" in current.prepared && current.prepared.roof_load_path && <p data-testid="roof-result-trace">{current.prepared.roof_load_path.actions.length} ação por área distribuída; áreas, resultantes e momentos globais conservados. A transferência até os apoios foi calculada pelo solver.</p>}
        {"wind_load_path" in current.prepared && current.prepared.wind_load_path && <p data-testid="wind-result-trace">{current.prepared.wind_load_path.cases.length} casos de vento zonal transmitidos às terças e ao Python; forças e momentos conservados. Combinações declaradas, validação normativa pendente.</p>}
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
        {current.resistanceError && <p role="alert" data-testid="resistance-blocked">Relatório resistente bloqueado: {current.resistanceError}</p>}
        {current.resistance && <ResistanceReportPanel project={active} onChange={edit} report={current.resistance} executions={current.designExecutions??[]} onComputed={r=>setSession(previous=>previous?.identity===identity?{...previous,designExecutions:[...(previous.designExecutions??[]).filter(x=>x.result.piece_id!==r.result.piece_id||x.result.combination_id!==r.result.combination_id),r]}:previous)} selectedPiece={selectedPiece} onSelectPiece={id=>{setPieceId(id);setSegmentId("");setNodeId("");}} onExport={()=>void exportResistance()}/>}
        <details><summary>Hipóteses e limites do cálculo</summary><ul>{current.result.assumptions.map(a => <li key={a}>{a}</li>)}</ul><p>Geometria original preservada. Deformada gráfica ainda não implementada. Juntas esféricas nas duas extremidades de pórticos e contatos independentes permanecem recusados.</p></details>
        <div className="actions"><button className="button secondary" onClick={() => exportJSON(current.prepared, "jpn-misto-entradas-rastreabilidade.json")}>Exportar entradas mistas</button><button className="button secondary" onClick={() => exportJSON({ prepared: current.prepared, result: current.result, execution: current.execution }, "jpn-misto-resultados-rastreabilidade.json")}>Exportar resultados mistos</button></div>
      </div>}
    </>}
    {current?.connectionError&&<p role="alert" data-testid="connection-report-blocked">Relatório de ligações bloqueado: {current.connectionError}</p>}
    <ConnectionsPanel project={active} report={current?.connections??null} combinationId={combo} selectedNode={connectionNodeId} onSelectNode={id=>{setConnectionNodeId(id);setNodeId(id);setPane("results");}} onSelectPiece={id=>{setPieceId(id);setSegmentId("");setPane("results");}} onChange={edit} onExport={()=>{if(!current?.connections||!current.jointActions)return;const mine=ticket.current.value;void assertConnectionReportCurrent(current.connections,active,current.prepared,current.result,current.jointActions).then(()=>{if(ticket.current.value===mine)exportJSON(current.connections,"jpn-ligacoes-acoes-preliminares.json");}).catch(e=>{if(ticket.current.value===mine)setError((e as Error).message);});}}/>
  </section>;
}
