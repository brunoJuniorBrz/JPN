import { projectSchema, type Project, type Settings } from "@/domain/models";
import { calculateEstimate } from "@/domain/calculations/estimate";

export function proposalPending(project: Project): string[] {
  const pending = [...calculateEstimate(project).pending];
  for (const [label, value] of [["Descreva o serviço incluído", project.description], ["Informe o prazo", project.estimate.deadline], ["Informe a forma de pagamento", project.estimate.paymentTerms], ["Informe a validade do orçamento", project.estimate.validity]]) {
    if (!value?.trim()) pending.push(`${label}.`);
  }
  return pending;
}

// Explicit allowlist: the customer document never receives internal prices or notes.
export function commercialProposal(input: Project, settings: Settings, now = new Date()) {
  const project = projectSchema.parse(input);
  if (proposalPending(project).length) throw new Error("Complete os dados do orçamento antes de gerar a proposta.");
  return {
    company: settings.companyName, businessInfo: settings.businessInfo,
    reference: project.id.slice(0, 8).toUpperCase(),
    issuedAt: now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    name: project.name, client: project.client, phone: project.phone, location: project.location,
    scope: project.description, deadline: project.estimate.deadline,
    paymentTerms: project.estimate.paymentTerms, validity: project.estimate.validity,
    exclusions: project.estimate.exclusions, notes: project.commercialNotes,
    saleCents: calculateEstimate(project).saleCents!, isExample: project.isExample,
  };
}
export type CommercialProposal = ReturnType<typeof commercialProposal>;

export function exportFilename(project: Project, prefix: string, extension: string) {
  const name = project.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "obra";
  return `${prefix}-${name}-${project.id.slice(0, 8)}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
