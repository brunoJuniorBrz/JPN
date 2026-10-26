"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import type { Project } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { Field, Input, Textarea } from "@/components/ui";
import { commercialProposal, downloadBlob, exportFilename, proposalPending } from "@/lib/exports/proposal";
import { calculateEstimate, moneyLabel } from "@/domain/calculations/estimate";

export function ProposalDelivery({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const { data, flush, saveProject } = useData();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const pending = proposalPending(project), result = calculateEstimate(project);
  function change(patch: Partial<Project>) { setMessage(""); setError(""); onChange(patch); }
  async function generate(kind: "pdf" | "xlsx") {
    setBusy(true); setMessage(""); setError("");
    try {
      saveProject(project);
      if (!flush()) throw new Error("Não foi possível salvar. Resolva o aviso de armazenamento antes de baixar.");
      if (kind === "pdf") {
        const proposal = commercialProposal(project, data.settings);
        const { createProposalPdf } = await import("@/lib/exports/pdf");
        downloadBlob(new Blob([createProposalPdf(proposal)], { type: "application/pdf" }), exportFilename(project, "orcamento", "pdf"));
        setMessage("PDF gerado. Abra o arquivo baixado para conferir e anexar no WhatsApp ou e-mail do cliente.");
      } else {
        const { createInternalWorkbook } = await import("@/lib/exports/workbook");
        downloadBlob(new Blob([await createInternalWorkbook(project, data.settings)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), exportFilename(project, "uso-interno", "xlsx"));
        setMessage("Planilha interna gerada. Ela contém seus custos e lucro.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o arquivo. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="proposal-delivery" aria-labelledby="delivery-title">
    <div className="proposal-heading"><FileText size={28} /><div><h3 id="delivery-title">Entregar o orçamento</h3><p>Complete as condições e baixe o documento para o cliente.</p></div></div>
    <p className="field-hint">Emitido por <strong>{data.settings.companyName}</strong>. <Link href="/configuracoes">Conferir dados da empresa</Link></p>
    <fieldset disabled={busy} className="proposal-fields">
      <Field label="Serviço incluído no orçamento"><Textarea maxLength={5000} value={project.description} onChange={e => change({ description: e.target.value })} placeholder="Descreva o que será fornecido e executado." /></Field>
      <div className="proposal-columns">
        <Field label="Forma de pagamento"><Textarea maxLength={2000} value={project.estimate.paymentTerms} onChange={e => change({ estimate: { ...project.estimate, paymentTerms: e.target.value } })} placeholder="Informe as condições que você vai oferecer." /></Field>
        <Field label="Prazo de execução"><Textarea maxLength={500} value={project.estimate.deadline} onChange={e => change({ estimate: { ...project.estimate, deadline: e.target.value } })} placeholder="Informe o prazo e quando ele começa a contar." /></Field>
      </div>
      <Field label="Validade do orçamento"><Input maxLength={500} value={project.estimate.validity} onChange={e => change({ estimate: { ...project.estimate, validity: e.target.value } })} placeholder="Ex.: 10 dias a partir da emissão" /></Field>
      <Field label="O que não está incluído (opcional)"><Textarea maxLength={2000} value={project.estimate.exclusions} onChange={e => change({ estimate: { ...project.estimate, exclusions: e.target.value } })} placeholder="Informe serviços ou materiais que ficam fora deste valor." /></Field>
      <Field label="Observações para o cliente (opcional)"><Textarea maxLength={5000} value={project.commercialNotes} onChange={e => change({ commercialNotes: e.target.value })} /></Field>
    </fieldset>
    <div className="proposal-check"><strong>{project.client}</strong><span>Valor total: {result.saleCents === null ? "A preencher" : moneyLabel(result.saleCents)}</span><p>O PDF apresenta o serviço e as condições acima. Preços de compra, lucro e anotações técnicas internas ficam fora dele.</p></div>
    {pending.length > 0 && <div className="notice"><strong>Para liberar o PDF</strong>{result.pending.length > 0 && <p>Resolva as pendências de cálculo listadas no início do resumo.</p>}<ul>{pending.filter(item => !result.pending.includes(item)).map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
    <button type="button" className="button proposal-download" disabled={busy || pending.length > 0} onClick={() => void generate("pdf")}><Download size={20} />{busy ? "Preparando arquivo…" : "Baixar orçamento em PDF"}</button>
    {project.isExample && <p className="field-hint">O PDF deste projeto terá a identificação de exemplo fictício.</p>}
    <details className="technical-details"><summary>Planilha para uso interno</summary><p>Contém materiais, quantidades de compra, custos, encargos e lucro. Os valores são uma fotografia do orçamento; para recalcular, altere os dados no sistema.</p><button type="button" className="button secondary" disabled={busy || result.saleCents === null} onClick={() => void generate("xlsx")}><Download size={18} />Baixar planilha interna</button></details>
    {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
