"use client";
import { prepareAnalysis, readAnalysis, isSecondOrder, solverRevision, swayDiagnostic, observedTranslationRatio, type PreparedAnalysis, type AnalysisResult, type AnalysisOrder } from "./mixed-analysis-mode";
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
import { mixedInputHash, mixedStations } from "@/domain/mixed-analysis";
import { acceptOverlay, buildResultOverlay, deformedSegments, overlayColors, studioModelFromPhysical } from "@/domain/studio-result-layers";
import { resultOverlayKinds, type ResultOverlayKind } from "./studio-result-overlay";
import type { buildMemberCombinationMatrix } from "@/domain/member-combination-matrix";
import { postAnalysis, type JobProgress } from "@/infrastructure/analysis/async-job-client";
import { adaptLoadedMixedProject, adaptLoadedMixedProjectV3 } from "@/domain/loaded-mixed-adapter";
import { AxisReviewPendingError } from "@/domain/local-axes-review";
import { projectFrameAxes, withReviewedIsotropicAxes } from "@/domain/current-mixed-adapter";
import { isLoadedResult } from "@/domain/structural-loading";
import { StructuralLoadsPanel } from "./structural-loads-panel";
import { LocalAxesPanel } from "./local-axes-panel";
import { NormativeIntegrationPanel } from "./normative-integration-panel";
import { AssessmentPanel, MemberStandardsPanel } from "./member-standards-panel";
import { provisionalNotices } from "@/domain/normative-provenance";
import { inspectConnectivity } from "@/domain/spatial-connectivity";
import { newSpatialPreparation } from "@/domain/spatial-preparation";
import { Field, Input, Select } from "@/components/ui";
import { downloadText } from "@/lib/format";
import { SpatialPreparationPanel } from "./spatial-preparation-panel";
import { Structure3D } from "./structure-3d";
import { PhysicalLineView } from "./physical-line-view";
import { MathematicalComparison } from "@/components/demonstration/mathematical-comparison";

type Prepared = PreparedAnalysis | Awaited<ReturnType<typeof adaptMixedProject>> | Awaited<ReturnType<typeof adaptLoadedMixedProject>> | Awaited<ReturnType<typeof adaptLoadedMixedProjectV3>>;
type Session = { identity: string; prepared: Prepared; result: AnalysisResult; execution: unknown; resistance: ResistanceReport | null; resistanceError: string; connections: ConnectionReport | null; connectionError: string; assessment?: unknown; assessmentError?: string; jointActions: JointActionTrace | null;designExecutions?:MemberExecution[] };
const show = (v: number) => v === 0 ? "0" : v.toExponential(5);
export function MixedAnalysisWorkspace({ project, onChange, demoPresentation=false }: { project: Project; onChange: (patch: Partial<Project>) => void; demoPresentation?:boolean }) {
  const [example, setExample] = useState<Project | null>(null), [pane, setPane] = useState(demoPresentation?"results":"prepare");
  // Built-in synthetic examples have isotropic sections: their roll is declared (and reviewed) here. User projects never get a default roll.
  const active = useMemo(() => {
    if (!example) return project;
    if (example.workspace.spatialPreparation?.localAxes) return example;           // explicit declaration made in the UI wins
    try { return withReviewedIsotropicAxes(example); } catch { return example; }   // anisotropic example: the roll becomes a visible pendency
  }, [example, project]), draft = active.workspace.spatialPreparation ?? newSpatialPreparation(active);
  const axes = useMemo(() => { try { return projectFrameAxes(active); } catch { return { framePieceIds: [] as string[], allPieceIds: [] as string[], pending: [], signature: "" }; } }, [active]);
  const [analysisOrder, setAnalysisOrder] = useState<AnalysisOrder>("linear");
  const signature = structureSignature(active), identity = JSON.stringify([analysisOrder, example ? "example" : "work", active.id, signature, { ...draft, resistanceStandards: undefined }]);
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
  const [job, setJob] = useState<JobProgress | null>(null);
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
    })().catch(e => { if (!controller.signal.aborted) setHealth(demoPresentation?"Executor indisponível nesta apresentação. Consulte a evidência histórica identificada abaixo.":`${(e as Error).message} No modo local, inicie com pnpm dev:structural; no modo remoto, confira o acesso de operador e a configuração do servidor.`); });
    return () => controller.abort();
  }, [healthRevision,demoPresentation]);
  function invalidate(clear=true) { ticket.current.value++; request.current?.abort(); if(clear)setSession(null); setBusyIdentity(null); setError(""); }
  // The resistance standard per piece only selects WHICH procedure verifies a piece; it does not change the analysed model, so results stay valid.
  function editStandards(patch: Partial<Project>) { if (example) setExample({ ...example, ...patch }); else onChange(patch); }
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
  // INT-1f: Studio view + traced result layers. A layer is drawn ONLY if reviewResultOverlay accepts it for the current input hash.
  const [viewerMode, setViewerMode] = useState<"studio" | "simple">("studio"), [layerKind, setLayerKind] = useState<ResultOverlayKind | "none">("none"), [scaleInput, setScaleInput] = useState("");
  const [hashed, setHashed] = useState<{ result: unknown; hash: string } | null>(null), [matrixState, setMatrixState] = useState<{ identity: string; matrix: ReturnType<typeof buildMemberCombinationMatrix> } | null>(null);
  // The hash is stored WITH the result it belongs to; a different (or no) result yields "" without any synchronous reset.
  useEffect(() => { let live = true; if (current) void mixedInputHash(current.result).then(h => { if (live) setHashed({ result: current.result, hash: h }); }); return () => { live = false; }; }, [current]);
  const resultHash = current && hashed?.result === current.result ? hashed.hash : "";
  const studioModel = useMemo(() => model && active.workspace.physicalStructure ? studioModelFromPhysical(model) : null, [model, active]);
  const layer = useMemo(() => {
    if (!current || !result || !selectedCombo || !resultHash || layerKind === "none" || !model) return null;
    const utilizationByPiece: Record<string, number> = {};
    if (matrixState?.identity === current.identity) for (const r of matrixState.matrix.rows) if (r.combinationId === selectedCombo && r.maxUtilization !== null) utilizationByPiece[r.pieceId] = Math.max(utilizationByPiece[r.pieceId] ?? 0, r.maxUtilization);
    // NBR 14762 pieces (per-piece cold-formed design control): their executed checks for THIS combination count too. Max utilization, never an approval.
    for (const e of (current.designExecutions ?? []) as { result: { piece_id: string; combination_id: string; checks: { utilization: number | null }[] } }[]) {
      if (e.result.combination_id !== selectedCombo) continue;
      const u = e.result.checks.map(c => c.utilization).filter((x): x is number => x !== null && Number.isFinite(x));
      if (u.length) utilizationByPiece[e.result.piece_id] = Math.max(utilizationByPiece[e.result.piece_id] ?? 0, ...u);
    }
    const overlay = buildResultOverlay(layerKind, { inputSha256: current.result.input_sha256, resultSha256: resultHash, combinationId: selectedCombo, solver: { name: current.result.solver.name, version: solverRevision(current.result) },
      mapped: current.prepared.mapping.members, nodes: result.nodes, members: result.members as never, utilizationByPiece });
    const verdict = acceptOverlay(overlay, model, current.prepared.input_sha256);
    if (!verdict.ok) return { refused: verdict.issues, overlay, colors: null, segments: null, legend: null, scale: 0 };
    const palette = overlayColors(overlay), req = current.prepared.request;
    const translations = Object.fromEntries(Object.entries(result.nodes).map(([id, n]) => [id, n.translation_m as [number, number, number]]));
    const maxDisp = Math.max(1e-12, ...Object.values(translations).map(t => Math.hypot(...t)));
    const span = Math.max(1e-9, ...["x_m", "y_m", "z_m"].map(k => { const v = req.nodes.map(n => n[k as "x_m"]); return Math.max(...v) - Math.min(...v); }));
    const auto = Math.min(1e5, Math.max(1, Math.round(0.08 * span / maxDisp))), manual = Number(scaleInput.replace(",", "."));
    const scale = scaleInput.trim() && Number.isFinite(manual) && manual >= 0 ? manual : auto;
    const segments = layerKind === "deformed-shape" ? deformedSegments({ nodes: req.nodes, members: current.prepared.mapping.members, translations, scale }) : null;
    return { refused: null, overlay, colors: overlay.pieces.length ? palette.colors : null, segments, legend: palette, scale };
  }, [current, result, selectedCombo, resultHash, layerKind, model, matrixState, scaleInput]);
  async function execute(includeConnections=false) {
    const controller = new AbortController(), mine = ++ticket.current.value; request.current?.abort(); request.current = controller;
    setBusyIdentity(identity); setError(""); setSession(null);setRestored(false);
    try {
      // C1: the UI emits jpn.mixed3d/3 with the REVIEWED Z-up local axes; frame pieces without a reviewed roll stop here (visible pendency).
      const prepared = await prepareAnalysis(active, analysisOrder); if (controller.signal.aborted || ticket.current.value !== mine) return;
      // INT-2: durable queue. A synchronous answer (local executor, or a fast remote run) comes back as before; a queued run reports pending/running and delivers the same envelope.
      const sent = await postAnalysis("/api/experimental/mixed3d", { body: JSON.stringify(prepared.request), headers: includeConnections ? { "X-JPN-Joint-Actions": "1" } : {}, signal: controller.signal, onProgress: p => { if (ticket.current.value === mine) setJob(p); } });
      const out = sent.out as { status?: string; schema_version?: string; execution?: { local_only?: boolean; transport?: string }; result?: unknown; joint_actions?: unknown };
      if (out.status !== "completed" || !((out.schema_version==="jpn.local-mixed/1"&&out.execution?.local_only===true)||(out.schema_version==="jpn.remote-mixed/1"&&out.execution?.local_only===false&&out.execution?.transport==="remote"))) throw new Error("Origem de execução incompatível.");
      const parsed = readAnalysis(prepared, out.result);
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      let resistance: ResistanceReport | null = null, resistanceError = "";
      try { if (isSecondOrder(parsed)) throw Error("SECOND_ORDER_RESISTANCE_PENDING: relatório resistente da segunda ordem ainda não integrado; resultado numérico experimental."); resistance = await buildResistanceReport(active, prepared, parsed,includeConnections?out.joint_actions:undefined); } catch(e) { resistanceError = (e as Error).message; }
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      // INT-1d: the M50/M51 structural assessment (local executor) runs after the resistance report and its outcome is shown; a failure never hides the analysis.
      let assessment: unknown = null, assessmentError = "";
      if (executionMode === "local" && !isSecondOrder(parsed)) { try { const ar = await fetch("/api/experimental/structural-assessment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schema_version: "jpn.structural-assessment/1", project: active }), signal: controller.signal }); const aj = await ar.json(); if (!ar.ok) throw new Error(`${aj.error?.code ?? ar.status}: ${aj.error?.message ?? "avaliação recusada"}`); assessment = aj; } catch (e) { assessmentError = (e as Error).message; } }
      if (controller.signal.aborted || ticket.current.value !== mine) return;
      let connections: ConnectionReport | null = null, connectionError = "", jointActions: JointActionTrace | null = null;
      if(includeConnections && !isSecondOrder(parsed)){try{jointActions=jointActionTraceSchema.parse(out.joint_actions);connections=await buildConnectionReport(active,prepared,parsed,jointActions);}catch(e){connectionError=(e as Error).message;}}
      if(controller.signal.aborted||ticket.current.value!==mine)return;
      if(!prepared.request.nodes.some(n=>n.id===connectionNodeId))setConnectionNodeId(prepared.request.nodes[0].id);
      setSession({ identity, prepared, result: parsed, execution: { ...out.execution, analysis_order: analysisOrder, normativeSwayClassification: "pending-reviewed-NBR8800-criterion", linearSufficiency: false, computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED" }, resistance, resistanceError, connections, connectionError, jointActions, assessment, assessmentError }); setCombo(Object.keys(parsed.combinations)[0]); setPane("results");
    } catch (e) { if (ticket.current.value === mine) setError(controller.signal.aborted ? "Execução cancelada ou prazo excedido; nenhum resultado publicado." : e instanceof AxisReviewPendingError ? `Giro por peça pendente: ${e.pending.map(p => p.pieceId).join(", ")}. Declare e revise os giros no painel “Eixos locais” antes de calcular.` : (e as Error).message); }
    finally { if (ticket.current.value === mine) { setBusyIdentity(null); setJob(null); } }
  }
  function exportJSON(value: unknown, name: string) { downloadText(JSON.stringify(value, null, 2), name); }
  async function restore(file:File){
    const mine=++ticket.current.value;request.current?.abort();setError("");
    try{
      if(file.size>5*1024*1024)throw Error("Resultado excede 5 MB.");
      if (analysisOrder !== "linear") throw Error("Restauração de segunda ordem pendente; execute novamente pela fila.");
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
    <p>Elasticidade linear do material; análise geométrica linear ou de segunda ordem por combinação. Peso próprio somente quando ativado com densidades e gravidade declaradas. Sem dimensionamento resistente ou autorização para fabricar.</p>
    {!demoPresentation&&<div className="actions"><button className="button secondary" onClick={() => switchScope(mixedReferenceProject())}>Abrir exemplo misto independente</button><button className="button secondary" onClick={()=>switchScope(loadedMixedReferenceProject())}>Abrir exemplo de peso e cargas</button><button className="button secondary" onClick={()=>switchScope(roofAreaReferenceProject())}>Abrir exemplo de ações por área</button><button className="button secondary" onClick={()=>switchScope(windReferenceProject())}>Abrir exemplo de vento zonal</button>{example && <button className="button secondary" onClick={() => switchScope(null)}>Voltar à obra</button>}</div>}
    <p className="notice" data-testid="mixed-scope">{example ? "EXEMPLO SINTÉTICO INDEPENDENTE — 10 × 20 × 4 m. Pilares, banzos, terças e montantes são pórticos rígidos; 36 diagonais são axiais. 12 bases engastadas, propriedades e forças sintéticas explícitas. Não altera nem salva sua obra." : "OBRA ATUAL — somente suas declarações físicas. Dados ausentes ou modelos instáveis bloqueiam o cálculo."}</p>
    <p role="status" data-testid="mixed-health">{health}</p>
    {session&&!current&&<p role="status" className="notice" data-testid="mixed-stale">Resultado obsoleto: os dados físicos mudaram. Execute novamente; nenhum resultado anterior será usado.</p>}
    {current&&<p role="status" data-testid="mixed-result-state">{restored?"Resultado restaurado de arquivo; origem numérica não comprovada nesta sessão. Execute novamente para recalcular.":"Resultado calculado pelo executor para esta revisão."} Fabricação bloqueada.</p>}
    {!demoPresentation&&<details className="technical-details"><summary>Recuperar resultado exportado</summary><p>O arquivo deve corresponder exatamente ao projeto atual, suas propriedades e revisão. Restaurar um arquivo não comprova sua origem numérica nem aprova a estrutura.</p><label>Resultado misto JSON<input type="file" accept=".json,application/json" aria-label="Restaurar resultado misto JSON" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void restore(file);}}/></label></details>}
    <button className="button secondary" disabled={busy} onClick={() => { setReady(false); setHealth("Verificando Python…"); setHealthRevision(v => v + 1); }}>Verificar executor {ready ? (executionMode==="remote"?"remoto":"local") : ""}</button>
    {!demoPresentation && <Field label="Ordem da análise"><Select value={analysisOrder} disabled={busy} onChange={e => { invalidate(); setAnalysisOrder(e.target.value as AnalysisOrder); }}><option value="linear">Linear (primeira ordem)</option><option value="second-order">Segunda ordem (por combinação)</option></Select></Field>}
    <p className="notice" data-testid="sway-normative-pending">Deslocabilidade NBR 8800: critério e limite revisados pendentes. O resultado linear não comprova suficiência; execute segunda ordem e solicite revisão profissional. Aprovação e fabricação bloqueadas.</p>
    {current && result && <p data-testid="observed-translation-ratio">Deslocamento nodal máximo / maior dimensão do modelo: {observedTranslationRatio(current.prepared.request.nodes, result.nodes)?.toExponential(5) ?? "indisponível"}. Indicador geométrico; não é deslocamento relativo entre pavimentos nem classificação NBR 8800.</p>}
    {current && selectedCombo && <p data-testid="analysis-order-result">{isSecondOrder(current.result) ? "Segunda ordem · per-combination" : "Linear · suficiência normativa pendente"} · combinação {selectedCombo}{(() => { const d = swayDiagnostic(current.result, selectedCombo); return d ? ` · amplificação segunda/primeira ordem: ${show(d.ratio)} (${d.measure}); diagnóstico numérico, sem classificação normativa.` : " · amplificação indisponível: segunda ordem ainda não executada."; })()}</p>}
    {!demoPresentation&&<nav className="physical-prep-tabs" aria-label="Fluxo misto"><button className="button secondary" aria-pressed={pane === "prepare"} onClick={() => setPane("prepare")}>Preparação mista</button><button className="button secondary" aria-pressed={pane === "results"} onClick={() => setPane("results")}>Resultados 3D</button></nav>}
    {pane === "prepare" && <>
      <SpatialPreparationPanel key={example ? "example" : "work"} project={active} onChange={edit} mixed />
      <NormativeIntegrationPanel project={active} onChange={next => edit({ workspace: next.workspace })} />
      <LocalAxesPanel framePieceIds={axes.framePieceIds} pending={axes.pending} review={draft.localAxes} readOnly={false}
        onDeclare={members => edit({ workspace: { ...active.workspace, spatialPreparation: { ...draft, localAxes: { version: 1, convention: "jpn-z-up/1", geometrySignature: axes.signature, members } } } })} />
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
    <div className="actions">{!demoPresentation&&<button className="button secondary" disabled={!ready||busy||analysisOrder !== "linear"} onClick={()=>void execute(true)}>Calcular ações de ligações</button>}<button className="button" disabled={!ready || busy} onClick={() => void execute()}>{busy ? "Executando Python…" : `Executar análise mista ${executionMode==="remote"?"online":"local"}`}</button>{busy && <button className="button secondary" onClick={()=>invalidate()}>Cancelar execução</button>}</div>
    {busy && job && <p role="status" data-testid="job-progress">Análise na fila durável do servidor: {job.state === "pending" ? "pendente" : job.state === "running" ? "rodando" : "pronta, baixando o resultado"} · {Math.round(job.elapsedMs / 1000)} s · consulta {job.polls} · identificador {job.job.slice(0, 24)}… (a execução continua no servidor se você fechar a página).</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {error&&stabilityFailureExplanation(error.split(":")[0])&&<p data-testid="connection-stability-failure">{stabilityFailureExplanation(error.split(":")[0])}</p>}
    {pane === "results" && <>
      {!current && <p className="notice" data-testid="mixed-no-results">Sem resultado atual. Execute após revisar os dados; alterações invalidam resultados anteriores.</p>}
      <Field label="Peça na análise mista"><Select value={selectedPiece} onChange={e => { setPieceId(e.target.value); setSegmentId(""); setNodeId(""); }}>{model?.pieces.map(p => <option key={p.id} value={p.id}>{p.id} · {p.role}</option>)}</Select></Field>
      {!demoPresentation&&<label className="checkbox-label"><input type="checkbox" checked={inspectNodes} onChange={e=>setInspectNodes(e.target.checked)}/>Selecionar nós físicos no 3D</label>}
      {model && !demoPresentation && <div data-testid="mixed-viewer">
        {studioModel && <div role="group" aria-label="Tipo de vista" className="view-switch">{([["studio", "Studio 3D"], ["simple", "Vista simples"]] as const).map(([k, label]) => <button key={k} type="button" className="button secondary" aria-pressed={viewerMode === k} data-testid={"viewer-" + k} onClick={() => setViewerMode(k)}>{label}</button>)}</div>}
        {current && <div data-testid="studio-layer-controls"><Field label="Camada de resultado (combinação selecionada)"><Select value={layerKind} data-testid="studio-layer-kind" onChange={e => setLayerKind(e.target.value as ResultOverlayKind | "none")}><option value="none">Sem camada (cores axiais)</option>{resultOverlayKinds.map(k => <option key={k} value={k}>{({ displacement: "Deslocamento", "deformed-shape": "Deformada", "bending-moment": "Momento fletor", shear: "Cortante", axial: "Axial", reaction: "Reações", verification: "Verificação (utilização)" } as Record<string, string>)[k]}</option>)}</Select></Field>
          {layerKind === "deformed-shape" && <Field label="Fator de escala da deformada (vazio = automático)"><input className="input" inputMode="decimal" value={scaleInput} onChange={e => setScaleInput(e.target.value)} placeholder={layer && !layer.refused ? String(layer.scale) : ""} /></Field>}
          {layer?.refused && <p className="field-error" role="alert" data-testid="studio-layer-refused">Camada recusada ({layer.refused.map(i => i.code).join(", ")}): {layer.refused[0].message}</p>}
          {layer && !layer.refused && layer.legend && <p data-testid="studio-layer-legend">{layer.overlay.kind}: de {layer.legend.min.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} a {layer.legend.valueMax.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {layer.legend.units} · combinação {layer.overlay.binding.combinationId} · {layer.overlay.binding.solver.name} {layer.overlay.binding.solver.version} · entrada {layer.overlay.binding.inputSha256.slice(0, 12)}…{layerKind === "deformed-shape" ? ` · escala ×${layer.scale}` : ""}. Imagem de resultados, não é aprovação estrutural.</p>}
          {layer && !layer.refused && !layer.overlay.pieces.length && <p className="notice" data-testid="studio-layer-empty">{layerKind === "verification" ? "Nenhuma utilização disponível para esta combinação: execute “Verificar peças NBR 8800” antes." : "Sem valores para esta camada nesta combinação."}</p>}
        </div>}
        {active.workspace.physicalStructure && viewerMode === "simple" ? <PhysicalLineView analysisColors={layer?.colors ?? colors} model={model} selected={selectedPiece} onSelect={id => { setPieceId(id); setSegmentId(""); }} selectedNodeId={connectionNodeId} onSelectNode={id => { setConnectionNodeId(id); setNodeId(id); }} />
          : <Structure3D inspectNodes={inspectNodes} selectedNodeId={connectionNodeId} onSelectNode={id => { setConnectionNodeId(id); setNodeId(id); }} model={(studioModel ?? model) as StructureModel} roof={active.roof} planning={active.planning} projectName={active.name} selected={selectedPiece} onSelect={id => { setPieceId(id); setSegmentId(""); setNodeId(""); }} analysisColors={layer?.colors ?? colors ?? {}} deformed={layer?.segments ?? null} />}
      </div>}
      {!demoPresentation&&<p>Legenda: pórtico azul; axial em tração turquesa; compressão violeta; nulo cinza; sinais diferentes entre segmentos ocre. Seleção laranja. Cores não verificam resistência.</p>}
      {demoPresentation&&current&&result&&<div data-testid="mixed-results">
        {!restored&&<MathematicalComparison request={current.prepared.request} result={current.result} inputHash={current.prepared.input_sha256}/>}
        <details className="technical-details"><summary>Ver deslocamentos, reações e esforços completos</summary>
          <Field label="Combinação mista"><Select value={selectedCombo??""} onChange={e=>setCombo(e.target.value)}>{Object.keys(current.result.combinations).map(id=><option key={id}>{id}</option>)}</Select></Field>
          <p>Resultados diretos do Python. Translações em m; reações em N; esforços nos eixos locais em N e N·m. Nos nós livres, os valores de força e momento são resíduos, sem reação de apoio. Zero não significa verificação de resistência.</p>
          <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Nó</th><th>Deslocamentos XYZ (m)</th><th>Reação / resíduo XYZ (N)</th><th>Momento / resíduo XYZ (N·m)</th></tr></thead><tbody>{Object.entries(result.nodes).map(([id,n])=><tr key={id}><td>{id} · {current.prepared.request.supports.some(s=>s.node===id)?"apoio":"nó livre"}</td><td>{n.translation_m.map(show).join("; ")}</td><td>{n.reaction_force_n.map(show).join("; ")}</td><td>{n.reaction_moment_nm.map(show).join("; ")}</td></tr>)}</tbody></table></div>
          {segment&&stations&&<><h4>Esforços da peça selecionada: {selectedPiece}, segmento {segment.id}</h4><div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>x (m)</th><th>N (N)</th><th>Vy (N)</th><th>Vz (N)</th><th>T (N·m)</th><th>My (N·m)</th><th>Mz (N·m)</th></tr></thead><tbody>{stations.map((s,i)=><tr key={i}>{[s.x_m,s.n_n,s.vy_n,s.vz_n,s.t_nm,s.my_nm,s.mz_nm].map((v,j)=><td key={j}>{show(v)}</td>)}</tr>)}</tbody></table></div></>}
          <p>Resíduo relativo do equilíbrio: {show(result.equilibrium.relative_residual)}. As condições normativas e de fabricação continuam bloqueadas.</p>
        </details>
        <div className="actions"><button className="button secondary" onClick={()=>exportJSON(current.prepared,"jpn-misto-entradas-rastreabilidade.json")}>Exportar entradas mistas</button><button className="button secondary" onClick={()=>exportJSON({prepared:current.prepared,result:current.result,execution:current.execution},"jpn-misto-resultados-rastreabilidade.json")}>Exportar resultados mistos</button></div>
      </div>}
      {current && result && !demoPresentation && <div data-testid="mixed-results">
        {provisionalNotices(draft.normativeProvenance).map(n => <p key={n} role="note" className="notice" data-testid="result-provisional-notice"><strong>{n}</strong></p>)}
        <p>{current.prepared.request.nodes.length} nós · {new Set(current.prepared.mapping.members.map(m => m.originalId)).size} peças · {current.prepared.request.members.length} segmentos · {current.prepared.request.members.filter(m => m.kind === "axial").length} axiais.</p>
        {isLoadedResult(current.result) && <p data-testid="loaded-result-trace">{current.result.loading.self_weight ? `Peso próprio declarado: ${show(current.result.loading.self_weight.total_mass_kg)} kg · caso ${current.result.loading.self_weight.case}.` : "Peso próprio desativado."} {current.result.loading.member_loads.length} cargas distribuídas físicas; sem duplicação automática.</p>}
        {isLoadedResult(current.result)&&<ul data-testid="declared-load-trace">{current.result.loading.member_loads.map(l=><li key={l.id}>{l.id}: peça {current.prepared.mapping.members.find(m=>m.id===l.member)?.originalId} → segmento {l.member} · {l.case} · {l.coordinate_system} · {l.force_per_length_n_m.join("; ")} N/m · {l.source} ({l.revision})</li>)}</ul>}
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
        <p>{("free_dofs" in current.result.diagnostics ? current.result.diagnostics.free_dofs : "?")} graus livres · condição escalada {("scaled_condition" in current.result.diagnostics ? show(current.result.diagnostics.scaled_condition) : "não fornecida")} · {show(current.result.diagnostics.elapsed_seconds)} s.</p>
        {current.resistanceError && <p role="alert" data-testid="resistance-blocked">Relatório resistente bloqueado: {current.resistanceError}</p>}
        {!demoPresentation && <AssessmentPanel assessment={current.assessment} error={current.assessmentError} />}
        {!demoPresentation && <MemberStandardsPanel project={active} resistance={current.resistance} onMatrix={m => setMatrixState(m ? { identity: current.identity, matrix: m } : null)} onChange={next => editStandards({ workspace: next.workspace })} />}
        {!demoPresentation&&current.resistance && <ResistanceReportPanel project={active} onChange={edit} report={current.resistance} executions={current.designExecutions??[]} onComputed={r=>setSession(previous=>previous?.identity===identity?{...previous,designExecutions:[...(previous.designExecutions??[]).filter(x=>x.result.piece_id!==r.result.piece_id||x.result.combination_id!==r.result.combination_id),r]}:previous)} selectedPiece={selectedPiece} onSelectPiece={id=>{setPieceId(id);setSegmentId("");setNodeId("");}} onExport={()=>void exportResistance()}/>}
        <details><summary>Hipóteses e limites do cálculo</summary><ul>{("assumptions" in current.result ? current.result.assumptions : ["Segunda ordem corrotacional experimental; convergência e refinamento verificados pelo solver. Classificação normativa de deslocabilidade pendente."]).map(a => <li key={a}>{a}</li>)}</ul><p>Geometria original preservada. Deformada disponível nas camadas do Studio com escala explícita. Juntas esféricas nas duas extremidades de pórticos e contatos independentes permanecem recusados.</p></details>
        <div className="actions"><button className="button secondary" onClick={() => exportJSON(current.prepared, "jpn-misto-entradas-rastreabilidade.json")}>Exportar entradas mistas</button><button className="button secondary" onClick={() => exportJSON({ prepared: current.prepared, result: current.result, execution: current.execution }, "jpn-misto-resultados-rastreabilidade.json")}>Exportar resultados mistos</button></div>
      </div>}
    </>}
    {current?.connectionError&&<p role="alert" data-testid="connection-report-blocked">Relatório de ligações bloqueado: {current.connectionError}</p>}
    {!demoPresentation&&<ConnectionsPanel project={active} report={current?.connections??null} combinationId={combo} selectedNode={connectionNodeId} onSelectNode={id=>{setConnectionNodeId(id);setNodeId(id);setPane("results");}} onSelectPiece={id=>{setPieceId(id);setSegmentId("");setPane("results");}} onChange={edit} onExport={()=>{if(!current?.connections||!current.jointActions)return;const mine=ticket.current.value;void assertConnectionReportCurrent(current.connections,active,current.prepared,current.result,current.jointActions).then(()=>{if(ticket.current.value===mine)exportJSON(current.connections,"jpn-ligacoes-acoes-preliminares.json");}).catch(e=>{if(ticket.current.value===mine)setError((e as Error).message);});}}/>}
  </section>;
}
