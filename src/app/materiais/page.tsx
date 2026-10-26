"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Input, PageHeading } from "@/components/ui";
import { MaterialForm } from "@/components/materials/material-form";
import { moneyLabel } from "@/domain/calculations/estimate";
import { formatDate } from "@/lib/format";
import type { Material } from "@/domain/models";
export default function MaterialsPage() {
  const { data, saveMaterial, removeMaterial } = useData(); const [search, setSearch] = useState(""); const [edit, setEdit] = useState<Material | "new" | null>(null);
  const materials = data.materials.filter(m => `${m.name} ${m.code} ${m.supplier}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <><PageHeading eyebrow="SEUS PREÇOS" title="Materiais" description="Cadastre os materiais uma vez e use nos seus orçamentos." action={<button className="button" onClick={() => setEdit("new")}><Plus size={20} />Cadastrar material</button>} />{edit !== null && <MaterialForm key={edit === "new" ? "new" : edit.id} initial={edit === "new" ? undefined : edit} onSave={saveMaterial} onCancel={() => setEdit(null)} />}<p className="notice">Os preços com a marca “Exemplo” são fictícios. Alterar o catálogo não muda preços de projetos já cadastrados.</p><Input aria-label="Pesquisar material" placeholder="Buscar por nome, código ou fornecedor" value={search} onChange={e => setSearch(e.target.value)} /><div className="catalog-grid">{materials.map(m => <article className="panel catalog-card" key={m.id}><div className="section-title"><h2>{m.name}</h2>{m.isExample && <span className="example-tag">Exemplo</span>}</div><p>{m.category}</p><strong className="material-price">{m.unitPriceCents === null ? "Preço pendente" : moneyLabel(m.unitPriceCents)} <small>/ {m.purchaseUnit}</small></strong><p className="muted">{m.supplier || "Fornecedor não informado"}</p>{m.purchaseUnit !== m.measurementUnit && <p className="notice">1 {m.purchaseUnit} = {m.measurementPerPurchase ?? "?"} {m.measurementUnit}</p>}<p className="field-hint">Atualizado em {formatDate(m.updatedAt)}</p><div className="actions"><button className="button secondary" onClick={() => setEdit(m)}><Pencil size={17} />Editar</button><button className="button secondary" onClick={() => { if (window.confirm(`Excluir “${m.name}” do catálogo? Itens já usados em projetos serão preservados.`)) removeMaterial(m.id); }}><Trash2 size={17} />Excluir</button></div></article>)}</div>{!materials.length && <div className="empty-state"><h2>Nenhum material encontrado</h2><p>Cadastre seu primeiro material ou tente outro nome.</p></div>}</>;
}
