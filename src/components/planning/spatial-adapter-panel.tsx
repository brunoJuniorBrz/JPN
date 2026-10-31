"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/domain/models";
import type { SpatialPreparation } from "@/domain/spatial-preparation";
import { generateStructure } from "@/domain/calculations/structure";
import { structureSignature } from "@/domain/calculations/project-basis";
import { inspectConnectivity } from "@/domain/spatial-connectivity";
import { adaptSpatialProject } from "@/domain/geometric-physical-adapter";
import { spatialAdapterExample } from "@/domain/examples/spatial-adapter-example";
import { canonicalSpatialInput, spatialResultSchema, type SpatialResult } from "@/domain/spatial-analysis";
import { Field, Input, Select } from "@/components/ui";
import { downloadText } from "@/lib/format";

type Prepared = Awaited<ReturnType<typeof adaptSpatialProject>>;
const display = (n: number) => n.toLocaleString("pt-BR", { maximumSignificantDigits: 7 });

export function SpatialAdapterPanel({ project, draft, onChange }: { project: Project; draft: SpatialPreparation; onChange: (next: SpatialPreparation) => void }) {
  const signature = structureSignature(project);
  const inspection = useMemo(() => {
    try {
      const model = generateStructure(project).model;
      if (!model) throw new Error("Geometria incompleta.");
      return { data: inspectConnectivity(model), error: "" };
    } catch (e) { return { data: null, error: (e as Error).message }; }
  }, [project]);
  const [source, setSource] = useState(draft.connectivity?.reviewSource ?? "");
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [state, setState] = useState<{ identity: string; prepared: Prepared; result?: SpatialResult; example: boolean } | null>(null);
  const [combination, setCombination] = useState(""), [nodeId, setNodeId] = useState(""), [memberId, setMemberId] = useState("");
  const identity = canonicalSpatialInput({ projectId: project.id, signature, preparation: draft });
  const latest = useRef(identity), abort = useRef<AbortController | null>(null), sequence = useRef(0);
  useEffect(() => { latest.current = identity; abort.current?.abort(); }, [identity]);
  useEffect(() => () => abort.current?.abort(), []);
  const current = state?.identity === identity ? state : null;
  const activeCombination = current?.result?.combinations[combination] ? combination : Object.keys(current?.result?.combinations ?? {})[0];
  const result = current?.result?.combinations[activeCombination];
  const activeNode = result?.nodes[nodeId] ? nodeId : Object.keys(result?.nodes ?? {})[0];
  const activeMember = result?.members[memberId] ? memberId : Object.keys(result?.members ?? {})[0];
  const node = result?.nodes[activeNode], member = result?.members[activeMember];
  async function prepare(example: boolean) {
    setError(""); setState(null); const basis = identity, ticket = ++sequence.current;
    try {
      const prepared = await adaptSpatialProject(example ? spatialAdapterExample() : { ...project, workspace: { ...project.workspace, spatialPreparation: draft } });
      if (latest.current !== basis || sequence.current !== ticket) return;
      setState({ identity: basis, prepared, example });
    } catch (e) { setError((e as Error).message); }
  }
  async function run() {
    if (!current) return;
    const basis = identity, ticket = ++sequence.current; setBusy(true); setError(""); setState({ ...current, result: undefined });
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/analysis3d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current.prepared.request), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error?.code ?? "ERRO"}: ${data.error?.message ?? "Análise recusada"}`);
      const output = spatialResultSchema.parse(data);
      const same = (a: string[], b: string[]) => [...a].sort().join("|") === [...b].sort().join("|");
      if (output.input_sha256 !== current.prepared.input_sha256 || canonicalSpatialInput(output.project) !== canonicalSpatialInput(current.prepared.request.project)
        || !same(Object.keys(output.combinations), current.prepared.request.combinations.map(c => c.id))
        || Object.values(output.combinations).some(c => !same(Object.keys(c.nodes), current.prepared.request.nodes.map(n => n.id)) || !same(Object.keys(c.members), current.prepared.request.members.map(m => m.id)))) throw new Error("Resposta incompatível com as entradas e IDs enviados.");
      if (latest.current !== basis || sequence.current !== ticket) throw new Error("Dados alterados durante o cálculo: resultado descartado.");
      setState({ ...current, result: output });
    } catch (e) { setError((e as Error).name === "AbortError" ? "Consulta interrompida; nenhum resultado novo publicado." : (e as Error).message); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  const exportJSON = (value: unknown, name: string) => downloadText(JSON.stringify(value, null, 2), name);
  return <section aria-label="Adaptador geométrico-físico experimental" className="technical-review">
    <h4>Conectividade e análise integrada experimental</h4>
    <p>Somente pórticos com ligações declaradas. Cada encontro precisa de decisão física; uma barra contínua é segmentada sem criar rótulas internas. Barras axiais, contatos independentes e cruzamentos sem nó original continuam bloqueados.</p>
    {inspection.error && <p role="alert">{inspection.error}</p>}
    {inspection.data && <>
      <details><summary>Revisar {inspection.data.junctions.length} juntas e peças originais</summary>
        <ul>{inspection.data.junctions.map(j => <li key={j.nodeId}><strong>{j.nodeId}</strong>: {j.pieceIds.join(", ")}{j.interiorPieceIds.length ? ` · segmentar ${j.interiorPieceIds.join(", ")}` : " · extremidades"}</li>)}</ul>
      </details>
      <Field label="Fonte da revisão de conectividade"><Input maxLength={1000} value={source} onChange={e => { setSource(e.target.value); setConfirmed(false); }}/></Field>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> Revisei todas as juntas listadas: conectar as peças indicadas nos mesmos nós, sem excentricidades, respeitando as liberações declaradas nas extremidades originais.</label>
      <div className="actions"><button type="button" className="button secondary" disabled={!confirmed || !source.trim() || busy} onClick={() => {
        onChange({ ...draft, connectivity: { version: 1, geometrySignature: signature, reviewSource: source,
          junctions: inspection.data!.junctions.map(j => ({ nodeId: j.nodeId, pieceIds: j.pieceIds, decision: "connect" })) } }); setConfirmed(false);
      }}>Registrar conexões revisadas</button></div>
      <p>{draft.connectivity ? draft.connectivity.geometrySignature === signature ? "Revisão de conectividade registrada. O solver ainda verificará a estabilidade." : "Conectividade desatualizada: revise novamente." : "Conectividade física ainda não declarada."} Se houver contatos independentes, este caso deve permanecer bloqueado nesta versão.</p>
    </>}
    <div className="actions">
      <button type="button" className="button secondary" disabled={busy} onClick={() => void prepare(false)}>Preparar modelo físico desta obra</button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void prepare(true)}>Carregar cobertura sintética validada 10 × 20 m</button>
    </div>
    <p className="field-hint">O exemplo é independente: não altera a obra. Pórticos rígidos em todas as peças, bases engastadas, propriedades sintéticas e carga nodal declarada. Não representa tesoura articulada ou especificação aprovada.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {current && <>
      <div className="notice" data-testid="adapter-prepared"><strong>{current.example ? "EXEMPLO SINTÉTICO INDEPENDENTE" : "MODELO DA OBRA — DECLARAÇÕES EXPLÍCITAS"}</strong>
        <p>{current.prepared.request.nodes.length} nós · {new Set(current.prepared.mapping.members.map(m => m.originalId)).size} peças originais · {current.prepared.request.members.length} segmentos físicos.</p>
        <p>Primeira ordem; cargas nodais; sem peso próprio automático, verificação normativa ou aprovação para fabricação.</p>
      </div>
      <details><summary>Entradas físicas e rastreabilidade — revisar antes de executar</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(current.prepared.request, null, 2)}</pre></details>
      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={() => void run()}>{busy ? "Calculando modelo integrado…" : "Executar modelo integrado experimental"}</button>
        <button type="button" className="button secondary" onClick={() => exportJSON(current.prepared, "jpn-adaptador-entradas-mapeamento.json")}>Exportar modelo e mapeamento</button>
      </div>
    </>}
    {current?.result && result && <div data-testid="adapter-results">
      <h4>Resultado integrado experimental</h4>
      <p>Resíduo relativo de equilíbrio: {result.equilibrium.relative_residual.toExponential(3)} · condição escalada: {display(current.result.diagnostics.scaled_condition)}.</p>
      <p>Deslocamento máximo: {display(Math.max(...Object.values(result.nodes).map(n => Math.hypot(...n.translation_m))) * 1000)} mm. Não é verificação de resistência.</p>
      <Field label="Combinação integrada"><Select value={activeCombination} onChange={e => setCombination(e.target.value)}>{Object.keys(current.result.combinations).map(id => <option key={id}>{id}</option>)}</Select></Field>
      <Field label="Nó do resultado integrado"><Select value={activeNode} onChange={e => setNodeId(e.target.value)}>{Object.keys(result.nodes).map(id => <option key={id}>{id}</option>)}</Select></Field>
      {node && <ul><li>Translações XYZ (mm): {node.translation_m.map(v => display(v * 1000)).join("; ")}</li><li>Rotações XYZ (rad): {node.rotation_rad.map(display).join("; ")}</li><li>Reações XYZ (kN): {node.force_n.map(v => display(v / 1000)).join("; ")}</li><li>Momentos de reação XYZ (kN·m): {node.moment_nm.map(v => display(v / 1000)).join("; ")}</li></ul>}
      <Field label="Segmento do resultado integrado"><Select value={activeMember} onChange={e => setMemberId(e.target.value)}>{current.prepared.mapping.members.map(m => <option value={m.id} key={m.id}>{m.id} ← {m.originalId} · {m.start} → {m.end}</option>)}</Select></Field>
      {member && <><p>Esforços nas estações locais do segmento; eixos e ações das extremidades constam na exportação completa.</p><ul>{member.stations.map(s => <li key={s.x_m}>x={display(s.x_m)} m: N/Vy/Vz (kN) {[s.n_n, s.vy_n, s.vz_n].map(v => display(v / 1000)).join("; ")}; T/My/Mz (kN·m) {[s.t_nm, s.my_nm, s.mz_nm].map(v => display(v / 1000)).join("; ")}</li>)}</ul></>}
      <button type="button" className="button secondary" onClick={() => exportJSON({ prepared: current.prepared, result: current.result }, "jpn-adaptador-resultados.json")}>Exportar resultados e rastreabilidade</button>
    </div>}
  </section>;
}
