"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import type { AxisPendency, LocalAxesReview } from "@/domain/local-axes-review";

/** C1: reviewed roll of each frame piece in the JPN Z-up system (jpn-z-up/1). Never defaulted: a piece without a current reviewed roll is a visible pendency. */
export function LocalAxesPanel({ framePieceIds, pending, review, readOnly, onDeclare }: {
  framePieceIds: string[]; pending: AxisPendency[]; review: LocalAxesReview | undefined; readOnly: boolean;
  onDeclare: (members: LocalAxesReview["members"]) => void;
}) {
  const [rolls, setRolls] = useState<Record<string, string>>({}), [source, setSource] = useState(""), [revision, setRevision] = useState(""), [confirm, setConfirm] = useState(false), [common, setCommon] = useState("");
  if (!framePieceIds.length) return null;
  const pendingIds = new Set(pending.map(p => p.pieceId)), reviewed = new Map((review?.members ?? []).map(m => [m.pieceId, m.rotationDeg]));
  const value = (id: string) => rolls[id] ?? (pendingIds.has(id) ? "" : String(reviewed.get(id) ?? ""));
  const parsed = framePieceIds.map(id => ({ id, n: value(id).trim() === "" ? NaN : Number(value(id)) }));
  const complete = parsed.every(p => Number.isFinite(p.n) && p.n >= -360 && p.n <= 360);
  const ready = complete && confirm && source.trim().length >= 5 && revision.trim().length >= 5;
  return <details className="technical-details" data-testid="local-axes-panel" open={pending.length > 0}>
    <summary>Eixos locais (jpn-z-up/1){pending.length ? ` — ${pending.length} peça(s) com giro pendente` : " — giros revisados"}</summary>
    <p>Sistema de referência: x do início ao fim; y horizontal; z no plano vertical da barra. Giro 0° faz Iy resistir às cargas verticais no plano da barra; o giro é a rotação pela mão direita em torno de x. Projetos antigos não migram: o giro anterior seguia a base interna do solver e não é reaproveitado.</p>
    {pending.length > 0 && <p role="alert" data-testid="local-axes-pending">Pendente: {pending.map(p => `${p.pieceId} (${p.reason === "missing" ? "sem giro revisado" : p.reason === "stale-geometry" ? "geometria alterada após a revisão" : p.reason === "duplicate" ? "declarado mais de uma vez" : "peça inexistente"})`).join(", ")}. A análise não é executada até a revisão.</p>}
    {!readOnly && <div className="actions"><Field label="Giro comum a todas as peças (graus)"><Input inputMode="decimal" value={common} onChange={e => setCommon(e.target.value)} /></Field>
      <button className="button secondary" disabled={!Number.isFinite(Number(common)) || common.trim() === ""} onClick={() => setRolls(Object.fromEntries(framePieceIds.map(id => [id, common.trim()])))}>Aplicar a todas as peças</button></div>}
    <ul>{framePieceIds.map(id => <li key={id}><Field label={`Giro da peça ${id} (graus)`}><Input inputMode="decimal" value={value(id)} disabled={readOnly} onChange={e => setRolls({ ...rolls, [id]: e.target.value })} /></Field></li>)}</ul>
    {!readOnly && <>
      <Field label="Fonte da revisão dos giros"><Input value={source} maxLength={1000} onChange={e => setSource(e.target.value)} /></Field>
      <Field label="Revisão"><Input value={revision} maxLength={1000} onChange={e => setRevision(e.target.value)} /></Field>
      <label className="checkbox-label"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />Revisei o giro de cada peça no sistema jpn-z-up/1 e declaro que representa a orientação física da seção.</label>
      <button className="button secondary" disabled={!ready} onClick={() => onDeclare(parsed.map(p => ({ pieceId: p.id, rotationDeg: p.n, source, revision })))}>Registrar giros revisados</button>
    </>}
    {readOnly && <p>Exemplo sintético embutido: seções isotrópicas (Iy = Iz), giro 0° declarado pelo próprio exemplo.</p>}
  </details>;
}
