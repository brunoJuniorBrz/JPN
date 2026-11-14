"use client";
import { useState } from "react";
import { Field, Select } from "@/components/ui";
import type { Project } from "@/domain/models";
import type { ResistanceReport } from "@/domain/resistance-report";
import { buildSteelIRequests, standardOf } from "@/domain/steel-i-member-requests";
import { buildMemberCombinationMatrix, type DesignExecution, type ResistanceStandard } from "@/domain/member-combination-matrix";

/** INT-1d: choose NBR 14762 (cold-formed) or NBR 8800 (I/H) PER PIECE; run the NBR 8800 member checks for every
 * NBR 8681 ULS combination and show the piece x combination matrix. Missing data = `unsupported`, never PASS. */
export function MemberStandardsPanel({ project, onChange, resistance }: { project: Project; onChange: (next: Project) => void; resistance: ResistanceReport | null }) {
  const draft = project.workspace.spatialPreparation;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [matrix, setMatrix] = useState<ReturnType<typeof buildMemberCombinationMatrix> | null>(null), [blocked, setBlocked] = useState<{ pieceId: string; reason: string }[]>([]);
  const pieceIds = resistance?.demands.pieces.filter(p => p.kind === "frame").map(p => p.pieceId) ?? [];
  const set = (pieceId: string, standard: ResistanceStandard) => {
    const rest = (draft?.resistanceStandards ?? []).filter(s => s.pieceId !== pieceId);
    onChange({ ...project, workspace: { ...project.workspace, spatialPreparation: { ...draft!, resistanceStandards: standard === "NBR14762" ? rest : [...rest, { pieceId, standard }] } } });
    setMatrix(null);
  };
  async function verify() {
    if (!resistance || !draft?.engineeringCombinations) { setError("Gere as combinações NBR 8681 e calcule antes."); return; }
    setBusy(true); setError(""); setMatrix(null);
    try {
      const uls = draft.engineeringCombinations.combinations.filter(c => c.purpose === "ULS").map(c => c.id);
      const built = buildSteelIRequests(project, resistance.demands as never, uls);
      setBlocked(built.blocked);
      const executions: DesignExecution[] = [];
      for (const r of built.requests) {
        const res = await fetch("/api/experimental/steel-design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.request) });
        const out = await res.json(); if (!res.ok) throw new Error(`${out.error?.code ?? res.status}: ${out.error?.message ?? "verificação recusada"}`);
        executions.push({ pieceId: r.pieceId, combinationId: r.combinationId, checks: out.result.checks });
      }
      const pieceStandards = Object.fromEntries(resistance.demands.pieces.map(p => [p.pieceId, standardOf(project, p.pieceId)]));
      setMatrix(buildMemberCombinationMatrix({ engineeringCombinations: draft.engineeringCombinations, demands: resistance.demands as never, executions, pieceStandards }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!draft || !pieceIds.length) return null;
  return <details className="technical-details" data-testid="member-standards" open>
    <summary>Norma de resistência por peça (NBR 14762 × NBR 8800)</summary>
    <p>NBR 14762: perfis formados a frio (verificação detalhada por peça abaixo). NBR 8800 (com a Errata 1:2025): perfis I/H soldados duplamente simétricos; usa o cadastro resistente (altura, mesa, alma, fy, fu, comprimentos). Dado ausente = <strong>não suportado</strong>.</p>
    <ul>{pieceIds.slice(0, 40).map(id => <li key={id}><Field label={`Norma da peça ${id}`}><Select value={standardOf(project, id)} onChange={e => set(id, e.target.value as ResistanceStandard)}><option value="NBR14762">NBR 14762:2010</option><option value="NBR8800">NBR 8800:2024</option></Select></Field></li>)}</ul>
    {pieceIds.length > 40 && <p>Exibindo as 40 primeiras peças de {pieceIds.length}.</p>}
    <button className="button" disabled={busy} onClick={() => void verify()}>{busy ? "Verificando NBR 8800…" : "Verificar peças NBR 8800 (matriz ELU)"}</button>
    {error && <p className="field-error" role="alert" data-testid="steel-matrix-error">{error}</p>}
    {blocked.length > 0 && <ul data-testid="steel-blocked">{blocked.map((b, i) => <li key={i}>{b.pieceId}: {b.reason}</li>)}</ul>}
    {matrix && <div data-testid="steel-matrix"><p>Matriz peça × combinação ELU (NBR 8681 × NBR 14762/NBR 8800): <strong>{matrix.status}</strong> · {matrix.unsupportedRows} linha(s) não suportada(s) · {matrix.failedRows} reprovada(s). Não é aprovação estrutural.</p>
      <table><thead><tr><th>Peça</th><th>Norma</th><th>Combinação</th><th>Estado</th><th>Utilização máx.</th><th>Motivo</th></tr></thead>
        <tbody>{matrix.rows.slice(0, 200).map(r => <tr key={r.pieceId + r.combinationId}><td>{r.pieceId}</td><td>{"resistanceStandard" in r ? r.resistanceStandard : "—"}</td><td>{r.combinationId}</td><td>{r.status}</td><td>{r.maxUtilization === null ? "—" : r.maxUtilization.toFixed(3)}</td><td>{r.reason ?? ""}</td></tr>)}</tbody></table></div>}
  </details>;
}

/** Outcome of the structural assessment (local executor): never an approval. */
export function AssessmentPanel({ assessment, error }: { assessment: unknown; error?: string }) {
  if (!assessment && !error) return null;
  const a = (assessment ?? {}) as { checks?: { failureMode: string; check: { status: string } }[]; resistanceAttempts?: { status: string }[]; releaseGate?: string; computedStructuralApproval?: boolean; fabricationRelease?: boolean; restraints?: { items?: unknown[] } };
  const count = (s: string) => a.checks?.filter(c => c.check.status === s).length ?? 0;
  return <section data-testid="assessment-panel"><h4>Avaliação estrutural (M50/M51)</h4>
    {error ? <p role="alert" data-testid="assessment-error">Avaliação indisponível: {error}</p> : <>
      <p data-testid="assessment-summary">Verificações: {a.checks?.length ?? 0} (CONDITIONAL {count("CONDITIONAL")}, FAIL {count("FAIL")}, BLOCKED {count("BLOCKED")}); tentativas de resistência: {a.resistanceAttempts?.filter(x => x.status === "executed").length ?? 0} executadas, {a.resistanceAttempts?.filter(x => x.status === "blocked").length ?? 0} bloqueadas; restrições declaradas: {a.restraints?.items?.length ?? 0}.</p>
      <p data-testid="assessment-gate">Liberação: {a.releaseGate ?? "NOT_READY_BLOCKED"} · aprovação estrutural calculada: {String(a.computedStructuralApproval ?? false)} · fabricação liberada: {String(a.fabricationRelease ?? false)}</p></>}
  </section>;
}
