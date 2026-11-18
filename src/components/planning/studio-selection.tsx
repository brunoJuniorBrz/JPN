"use client";
import { useId, useMemo, useState } from "react";
import { Crosshair, MapPin, Search, X } from "lucide-react";
import { roleLabels, type StructureModel } from "@/domain/structure";
import { mixedStations } from "@/domain/mixed-analysis";
import { formatMeasure } from "@/domain/calculations/units";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { findPieces } from "./piece-search";
import { pieceExtremes, useStudioAnalysis } from "./studio-analysis";

const kn = (value: number | null | undefined, digits = 2) => value === null || value === undefined ? "—" : formatMeasure(value, digits);

/**
 * Inspetor de seleção (F2): peça, segmentos e nó/apoio. Lê o modelo e, quando existe, a análise
 * atual (mesma entrada). Mostra esforços já calculados e pendências; nunca aprova peça ou apoio.
 */
export function StudioSelection({ model, selected, hovered = "", onSelect, nodeId, onSelectNode }: {
  model: StructureModel | null; selected: string; hovered?: string; onSelect: (id: string) => void;
  nodeId: string; onSelectNode: (id: string) => void;
}) {
  const { analysis } = useStudioAnalysis();
  const [query, setQuery] = useState(""), [nodeQuery, setNodeQuery] = useState("");
  const searchId = useId(), nodeSearchId = useId();
  const piece = model?.pieces.find(p => p.id === (selected || hovered)) ?? null;
  const matches = useMemo(() => model && query.trim() ? findPieces(model.pieces, query) : null, [model, query]);
  const nodeMatches = useMemo(() => {
    if (!model || !nodeQuery.trim()) return [];
    const q = nodeQuery.trim().toLowerCase();
    return model.nodes.filter(n => n.id.toLowerCase().includes(q)).slice(0, 8);
  }, [model, nodeQuery]);
  const comb = analysis.state === "current" ? analysis.result?.combinations[analysis.combo] : undefined;
  const stationsOf = (memberId: string) => {
    const m = comb?.members[memberId];
    return m ? mixedStations(m as Parameters<typeof mixedStations>[0]) : null;
  };
  const extremes = piece && comb ? pieceExtremes(analysis, piece.id, stationsOf) : null;
  const report = analysis.state === "current" ? analysis.resistance : null;
  const pieceReport = piece && report ? report.pieces.find(p => p.pieceId === piece.id) : undefined;
  const utilization = piece ? analysis.utilizationByPiece?.[piece.id] : undefined;
  const node = comb && nodeId ? comb.nodes[nodeId] : undefined;
  const supportAudit = report && nodeId ? report.supportAudits.find(a => a.nodeId === nodeId && a.combinationId === analysis.combo) : undefined;
  if (!model) return null;

  return <section className="studio-selection" aria-label="Seleção no modelo" data-testid="studio-selection">
    <div className="studio-selection-search">
      <label htmlFor={searchId} className="studio-selection-label"><Search size={14} aria-hidden="true" />Buscar peça</label>
      <input id={searchId} className="input" type="search" value={query} placeholder="ID ou categoria (ex.: P1, Terças)" onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && matches?.matches[0]) { e.preventDefault(); onSelect(matches.matches[0].id); setQuery(""); } }} />
      {matches && <ul className="studio-selection-results" aria-label="Peças encontradas">
        {matches.matches.slice(0, 8).map(p => <li key={p.id}><button type="button" onClick={() => { onSelect(p.id); setQuery(""); }}>{p.id} · {roleLabels[p.role]} · {formatMeasure(p.lengthMm / 1000)} m</button></li>)}
        {matches.total === 0 && <li className="field-hint">Nenhuma peça corresponde à busca.</li>}
        {matches.total > 8 && <li className="field-hint">Mais {matches.total - 8} peças; refine a busca.</li>}
      </ul>}
    </div>

    {piece ? <article className="studio-selection-card" aria-label={`Peça ${piece.id}`}>
      <header>
        <div><strong>{piece.id}</strong> · {roleLabels[piece.role]}{!selected && <small> · sob cursor</small>}</div>
        {selected ? <IconButton size="sm" label="Desmarcar peça" icon={<X />} onClick={() => onSelect("")} /> : <button type="button" className="button secondary" onClick={() => onSelect(piece.id)}>Fixar seleção</button>}
      </header>
      <dl className="studio-facts">
        <div><dt>Perfil</dt><dd>{piece.profile.name || piece.profile.section || "Perfil não definido"}</dd></div>
        <div><dt>Comprimento</dt><dd>{formatMeasure(piece.lengthMm / 1000, 3)} m</dd></div>
        <div><dt>Massa</dt><dd>{piece.massKg === null ? "Pendente" : `${formatMeasure(piece.massKg, 1)} kg`}</dd></div>
        <div><dt>Nós</dt><dd>{piece.start} → {piece.end}</dd></div>
      </dl>
      {analysis.state === "current" ? <>
        <p className="studio-selection-sub">Combinação ativa: <strong>{analysis.combo}</strong></p>
        {extremes ? <dl className="studio-facts studio-facts--forces" data-testid="selection-forces">
          <div><dt>N máx.</dt><dd>{kn(extremes.nKn)} kN</dd></div>
          <div><dt>V máx.</dt><dd>{extremes.vKn === null ? "não se aplica (axial)" : `${kn(extremes.vKn)} kN`}</dd></div>
          <div><dt>M máx.</dt><dd>{extremes.mKnM === null ? "não se aplica (axial)" : `${kn(extremes.mKnM)} kN·m`}</dd></div>
          <div><dt>Segmentos</dt><dd>{extremes.segments.join(", ")}</dd></div>
        </dl> : <p className="field-hint">Esta peça não está no modelo analisado.</p>}
        {pieceReport && <div className="studio-selection-status">
          <Badge tone={utilization !== undefined && utilization > 1 ? "danger" : "warning"}>
            {utilization === undefined ? "Utilização não calculada" : `Utilização verificada parcialmente: ${(utilization * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · sem aprovação`} · peça {pieceReport.status === "incomplete" ? "incompleta" : pieceReport.status}
          </Badge>
          {pieceReport.normativeReadiness.blockers.length > 0 && <details><summary>Pendências desta peça ({pieceReport.normativeReadiness.blockers.length})</summary><ul>{pieceReport.normativeReadiness.blockers.slice(0, 6).map((b, i) => <li key={i}>{b}</li>)}</ul></details>}
        </div>}
      </> : <p className="field-hint">{analysis.state === "stale" ? "Análise desatualizada: recalcule para ver esforços desta peça." : analysis.state === "running" ? "Análise em execução…" : "Sem análise atual. Execute a Análise Estrutural Experimental para ver N, V e M."}</p>}
      <Badge tone="danger">Não aprovada · bloqueada para fabricação</Badge>
    </article> : <p className="field-hint studio-selection-empty"><Crosshair size={14} aria-hidden="true" /> Clique numa peça no modelo ou busque pelo ID.</p>}

    <div className="studio-selection-search">
      <label htmlFor={nodeSearchId} className="studio-selection-label"><MapPin size={14} aria-hidden="true" />Nó ou apoio</label>
      <input id={nodeSearchId} className="input" type="search" value={nodeQuery} placeholder="ID do nó (ex.: B0)" onChange={e => setNodeQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && nodeMatches[0]) { e.preventDefault(); onSelectNode(nodeMatches[0].id); setNodeQuery(""); } }} />
      {nodeMatches.length > 0 && <ul className="studio-selection-results" aria-label="Nós encontrados">{nodeMatches.map(n => <li key={n.id}><button type="button" onClick={() => { onSelectNode(n.id); setNodeQuery(""); }}>{n.id}</button></li>)}</ul>}
    </div>
    {nodeId && <article className="studio-selection-card" aria-label={`Nó ${nodeId}`}>
      <header><div><strong>Nó {nodeId}</strong>{supportAudit ? ` · apoio ${supportAudit.kind}` : ""}</div><IconButton size="sm" label="Limpar nó" icon={<X />} onClick={() => onSelectNode("")} /></header>
      {node ? <dl className="studio-facts">
        <div><dt>Reação Fx, Fy, Fz</dt><dd>{node.reaction_force_n.map(v => kn(v / 1000)).join(" · ")} kN</dd></div>
        <div><dt>Momento de reação</dt><dd>{kn(Math.hypot(...node.reaction_moment_nm) / 1000)} kN·m</dd></div>
      </dl> : <p className="field-hint">{analysis.state === "current" ? "Este nó não está no resultado da combinação ativa." : "Sem análise atual para mostrar reações."}</p>}
      {supportAudit && <div className="studio-selection-status" data-testid="selection-support">
        <Badge tone={supportAudit.status === "exceeds-declared-capacity" ? "danger" : supportAudit.status === "capacity-pending" ? "warning" : "success"}>
          {supportAudit.status === "exceeds-declared-capacity" ? "Excede capacidade declarada" : supportAudit.status === "capacity-pending" ? "Capacidade pendente" : "Dentro da capacidade declarada"}
        </Badge>
        <dl className="studio-facts">
          {supportAudit.checks.map(c => <div key={c.action}><dt>{c.action === "upliftKn" ? "Arrancamento" : c.action === "compressionKn" ? "Compressão" : "Cisalhamento horizontal"}</dt><dd>{kn(c.demandKn)} kN · capacidade {c.declaredCapacityKn === null ? "pendente" : `${kn(c.declaredCapacityKn)} kN`}</dd></div>)}
        </dl>
        <details><summary>Limitações do apoio ({supportAudit.limitations.length})</summary><ul>{supportAudit.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
      </div>}
    </article>}
  </section>;
}
