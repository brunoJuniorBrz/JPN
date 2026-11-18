"use client";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { useData } from "@/components/data-provider";
import { TrussEditor } from "@/components/truss/truss-editor";
import { newProject } from "@/domain/models";
import { applyTrussToProject } from "@/domain/truss-editor";

export default function TrussPage() {
  const router = useRouter(), { data, saveProject, flush } = useData();
  return <section>
    <PageHeading eyebrow="FERRAMENTA" title="Tesoura" description="Monte a tesoura de uma ou duas águas do jeito que ela é fabricada: medidas em cm, ajuste ponto a ponto, barras e preço na hora." />
    <TrussEditor applyLabel="Criar projeto com esta tesoura" onApply={t => {
      const base = newProject(data.settings);
      base.name = `Cobertura ${t.roofKind === "two-slopes" ? "duas águas" : "uma água"} ${(t.spanMm / 1000).toLocaleString("pt-BR")} x ${(t.lengthMm / 1000).toLocaleString("pt-BR")} m`;
      base.client = "Cliente a informar";
      const project = applyTrussToProject(base, t);
      saveProject(project);
      if (!flush()) throw Error("Não foi possível salvar o projeto neste navegador.");
      router.push(`/projetos/${project.id}?fluxo=levantamento&etapa=3`);
    }} />
  </section>;
}
