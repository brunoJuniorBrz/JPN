"use client";
import { trussEditorSchema, trussSummary } from "@/domain/truss-editor";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Lock, RefreshCw } from "lucide-react";
import type { Project } from "@/domain/models";
import type { StructureResult } from "@/domain/structure";
import { calculateEstimate } from "@/domain/calculations/estimate";
import { formatMeasure } from "@/domain/calculations/units";
import { resolvePhysicalStructure } from "@/domain/physical-structure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { summarizePending } from "./result-presentation";
import { useStudioAnalysis } from "./studio-analysis";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Totais ao vivo (F4): derivados de forma síncrona do projeto em memória, sem esperar o salvamento. */
export function liveTotals(project: Project, result: StructureResult | null) {
  const model = result?.model ?? (project.workspace.physicalStructure ? resolvePhysicalStructure(project).model : null);
  // Massa só aparece quando alguma peça tem massa cadastrada; nada de "0 kg" por falta de dado.
  const known = model && result?.model ? result.model.pieces.reduce((sum, p) => sum + (p.massKg ?? 0), 0) : 0;
  // Obra do editor de tesoura: a massa é a mesma do "Resumo ao vivo" (kg/m de cada perfil escolhido).
  let trussKg: number | null = null;
  if (!result?.model && project.workspace.physicalStructure && project.workspace.trussEditor) {
    try { trussKg = trussSummary(trussEditorSchema.parse(project.workspace.trussEditor)).kg.total; } catch { trussKg = null; }
  }
  const massKg = trussKg !== null && trussKg > 0 ? trussKg : model && known > 0 ? known : null;
  let saleCents: number | null = null;
  try { saleCents = calculateEstimate(project).saleCents; } catch { saleCents = null; }
  return { pieces: model?.pieces.length ?? null, lengthM: model && result?.model ? result.model.totalLengthM : model ? model.pieces.reduce((sum, item) => sum + item.lengthMm, 0) / 1000 : null, massKg, massComplete: result?.model?.massComplete ?? trussKg !== null, saleCents };
}

/** Estado da análise para a barra: atual, desatualizada, rodando há N s, erro ou sem análise. */
export function AnalysisState({ onOpenAnalysis }: { onOpenAnalysis: () => void }) {
  const { analysis, commands, runningSince } = useStudioAnalysis();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (analysis.state !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [analysis.state]);
  const seconds = runningSince ? Math.max(0, Math.round((now - runningSince) / 1000)) : 0;
  const job = analysis.job as { status?: string; progress?: { stage?: string } } | null;
  const label = analysis.state === "current" ? "Análise atual"
    : analysis.state === "stale" ? "Análise desatualizada"
    : analysis.state === "running" ? `Rodando há ${seconds} s${job?.status ? ` · ${job.status}` : ""}`
    : analysis.state === "error" ? "Análise com erro"
    : analysis.state === "idle" ? "Sem análise executada" : "Análise não aberta";
  const Icon = analysis.state === "current" ? CheckCircle2 : analysis.state === "running" ? Loader2 : analysis.state === "stale" || analysis.state === "error" ? AlertTriangle : Clock3;
  return <div className="studio-analysis-state" data-testid="studio-analysis-state" data-state={analysis.state}>
    <span className={`studio-analysis-chip studio-analysis-chip--${analysis.state}`} role="status"><Icon size={14} aria-hidden="true" className={analysis.state === "running" ? "spin" : undefined} />{label}</span>
    {/* Um único botão: executa a mesma análise da etapa Análise; se ela ainda não está pronta, leva até lá. */}
    <Button size="sm" variant={analysis.state === "stale" ? "primary" : "secondary"} disabled={analysis.state === "running"} onClick={() => { if (analysis.ready) commands.run(); else onOpenAnalysis(); }}
      title={analysis.ready ? "Executa a mesma Análise Estrutural Experimental da etapa Análise" : "Abre a Análise Estrutural Experimental para preparar o executor"}>
      <RefreshCw size={14} aria-hidden="true" />Recalcular
    </Button>
  </div>;
}

/**
 * Selo "Bloqueado para fabricação" (F4): sempre visível; abre o painel de pendências agrupadas.
 * Lista o que já existe no sistema; não cria nem remove bloqueios.
 */
export function FabricationSeal({ result, declaredIssues }: { result: StructureResult | null; declaredIssues: string[] }) {
  const { analysis } = useStudioAnalysis();
  const report = analysis.state === "current" ? analysis.resistance : null;
  const generatedPending = result ? summarizePending(result.pending) : [];
  const missing = [
    ...generatedPending.map(p => p.text),
    ...declaredIssues,
    ...(report?.pieces.flatMap(p => p.dataIssues.map(issue => `${p.pieceId}: ${issue}`)) ?? []),
  ];
  const normative = [
    ...(report?.releaseGate.blocked.map(b => b.reason) ?? []),
    ...(report?.pieces.flatMap(p => p.normativeReadiness.blockers.filter(b => !p.dataIssues.includes(b)).map(b => `${p.pieceId}: ${b}`)) ?? []),
  ];
  const engineer = [
    "Aprovação estrutural calculada: não (computedStructuralApproval = false).",
    "Liberação para fabricação: não (fabricationRelease = false · NOT_READY_BLOCKED).",
    "Revisão profissional e responsabilidade técnica: não emitidas pelo sistema.",
    ...(report?.remaining ?? []),
  ];
  const groups = [
    { id: "normativas", label: "Normativas", items: normative.length ? normative : ["Sem análise atual: as verificações normativas não foram executadas para esta revisão."] },
    { id: "dados", label: "Dados faltando", items: missing.length ? missing : ["Nenhum dado cadastral pendente nesta geometria (as verificações normativas continuam incompletas)."] },
    { id: "engenheiro", label: "Revisão do engenheiro", items: engineer },
  ];
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="studio-seal" data-testid="fabrication-seal" aria-haspopup="dialog">
        <Badge tone="danger" icon={<Lock />} className="studio-lock">Bloqueado para fabricação</Badge>
        <span className="studio-seal-count">{groups.reduce((sum, g) => sum + g.items.length, 0)} pendências</span>
      </button>
    </DialogTrigger>
    <DialogContent title="Pendências do projeto" description="Bloqueado para fabricação até que todas sejam resolvidas e revisadas por um engenheiro. Status do sistema: NOT_READY_BLOCKED." className="studio-pending-dialog">
      <Tabs defaultValue="normativas">
        <TabsList aria-label="Grupos de pendências">{groups.map(g => <TabsTrigger key={g.id} value={g.id}>{g.label} ({g.items.length})</TabsTrigger>)}</TabsList>
        {groups.map(g => <TabsContent key={g.id} value={g.id} className="studio-pending-list"><ul>{g.items.map((item, i) => <li key={i}>{item}</li>)}</ul></TabsContent>)}
      </Tabs>
    </DialogContent>
  </Dialog>;
}

export function LiveTotals({ totals, includeGeometry = false }: { totals: ReturnType<typeof liveTotals>; includeGeometry?: boolean }) {
  if (totals.pieces === null) return null;
  return <div className="studio-live-totals" data-testid="studio-live-totals" aria-label="Totais ao vivo">
    {includeGeometry && <><span><small>Peças</small><strong>{totals.pieces}</strong></span><span><small>Comprimento</small><strong>{formatMeasure(totals.lengthM ?? 0, 2)} m</strong></span></>}
    <span><small>Massa</small><strong>{totals.massKg === null ? "pendente" : `${formatMeasure(totals.massKg, 0)} kg${totals.massComplete ? "" : " (parcial)"}`}</strong></span>
    <span><small>Venda</small><strong>{totals.saleCents === null ? "a definir" : money(totals.saleCents)}</strong></span>
  </div>;
}
