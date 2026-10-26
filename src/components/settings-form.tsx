"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { settingsSchema, type Settings } from "@/domain/models";
import { useData } from "@/components/data-provider";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { decimalInput } from "@/lib/format";
export function SettingsForm({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState(initial); const [waste, setWaste] = useState(String(initial.defaultWastePercent).replace(".", ",")); const [pricing, setPricing] = useState(String(initial.defaultPricingPercent).replace(".", ","));
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const { saveSettings, setInvalidDraft } = useData();
  useEffect(() => () => setInvalidDraft(false), [setInvalidDraft]);
  function change<K extends keyof Settings>(key: K, value: Settings[K]) { setDraft(d => ({ ...d, [key]: value })); setInvalidDraft(true); setMessage(""); }
  return <form className="panel settings-panel" noValidate onSubmit={e => {
    e.preventDefault(); setMessage("");
    const parsed = settingsSchema.safeParse({ ...draft, defaultWastePercent: decimalInput(waste), defaultPricingPercent: decimalInput(pricing) });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.path[0] === "defaultWastePercent" ? "Perdas: informe um percentual entre 0 e 100." : issue.path[0] === "defaultPricingPercent" ? "Informe um percentual válido: margem menor que 100%; markup até 1.000%." : issue.message).join(" ")); return; }
    setError(""); if (saveSettings(parsed.data)) { setInvalidDraft(false); setMessage("Configurações salvas neste navegador."); }
  }}><h2>Empresa e preferências</h2><p className="muted">Identificação usada na interface e base para futuros documentos.</p><Field label="Nome da empresa *"><Input maxLength={200} value={draft.companyName} onChange={e => change("companyName", e.target.value)} /></Field><Field label="Informações comerciais"><Textarea maxLength={2000} value={draft.businessInfo} onChange={e => change("businessInfo", e.target.value)} placeholder="Endereço, contato, CNPJ e outras informações que desejar registrar." /></Field><h3>Padrões para novos orçamentos</h3><p className="field-hint">Estes padrões são usados em novos projetos e itens. Orçamentos existentes mantêm seus valores.</p><div className="form-grid"><Field label="Perdas padrão (%)"><Input inputMode="decimal" value={waste} onChange={e => { setWaste(e.target.value); setInvalidDraft(true); setMessage(""); }} /></Field><Field label="Método de formação de preço"><Select value={draft.pricingMode} onChange={e => change("pricingMode", e.target.value as Settings["pricingMode"])}><option value="markup">Markup sobre custo</option><option value="margin">Margem sobre venda</option></Select></Field><Field label={draft.pricingMode === "markup" ? "Markup padrão (%)" : "Margem padrão (%)"}><Input inputMode="decimal" value={pricing} onChange={e => { setPricing(e.target.value); setInvalidDraft(true); setMessage(""); }} /></Field><Field label="Moeda"><Input value="BRL · Real brasileiro" readOnly /></Field></div><p className="field-hint">Markup é o acréscimo sobre o custo. Margem é a proporção do lucro sobre o preço de venda. São conceitos diferentes.</p><label className="checkbox-label"><input type="checkbox" checked={draft.compactView} onChange={e => change("compactView", e.target.checked)} />Usar cards compactos na lista de projetos</label>{error && <p className="field-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<button className="button" type="submit"><Save size={18} />Salvar configurações</button></form>;
}
