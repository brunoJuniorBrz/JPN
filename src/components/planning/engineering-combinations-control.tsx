"use client";
import { useState } from "react";
import type { Project } from "@/domain/models";
import type { EngineeringCombinations } from "@/domain/engineering-combinations";
import { applyEngineeringCombinations } from "@/domain/apply-engineering-combinations";
import { Field,Input,Select } from "@/components/ui";

type Props={project:Project;onChange:(patch:Partial<Project>)=>void};
export function EngineeringCombinationsControl(props:Props){
  const declarations=props.project.workspace.spatialPreparation?.engineeringCombinations;
  const [selected,setSelected]=useState("");
  const combination=declarations?.combinations.find(c=>c.id===selected);
  if(!declarations)return null;
  return <details data-testid="engineering-combinations-control"><summary>Revisar finalidade e fatores das combinações</summary>
    <p>Edite uma combinação já declarada. Nenhum fator normativo é selecionado automaticamente. Informe a referência aplicável e confira compatibilidade entre edições das normas, ações favoráveis/desfavoráveis e exclusividade dos casos. Registrar invalida a análise e a conferência de duplicidade.</p>
    <Field label="Combinação para revisar"><Select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{declarations.combinations.map(c=><option key={c.id}>{c.id}</option>)}</Select></Field>
    {combination&&<CombinationForm key={JSON.stringify(combination)} {...props} declarations={declarations} combination={combination}/>}
  </details>;
}
function CombinationForm({project,onChange,declarations,combination}:{declarations:EngineeringCombinations;combination:EngineeringCombinations["combinations"][number]}&Props){
  const [purpose,setPurpose]=useState(combination.purpose),[hypothesis,setHypothesis]=useState(combination.hypothesis),[reference,setReference]=useState(combination.reference);
  const [terms,setTerms]=useState(combination.terms.map(t=>({...t,gamma:String(t.gamma),psi:String(t.psi)}))),[message,setMessage]=useState("");
  const labels={standard:"Norma",edition:"Edição",clause:"Cláusula",source:"Fonte",revision:"Revisão",responsible:"Responsável"};
  return <div><Field label="Finalidade declarada da combinação"><Select value={purpose} onChange={e=>setPurpose(e.target.value as typeof purpose)}>{(["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"] as const).map(v=><option key={v}>{v}</option>)}</Select></Field>
    <Field label="Hipótese da combinação revisada"><Input value={hypothesis} maxLength={1000} onChange={e=>setHypothesis(e.target.value)}/></Field>
    <div className="form-grid">{Object.entries(labels).map(([key,label])=><Field key={key} label={`${label} da combinação revisada`}><Input value={reference[key as keyof typeof reference]} maxLength={1000} onChange={e=>setReference({...reference,[key]:e.target.value})}/></Field>)}</div>
    {terms.map((t,i)=><fieldset key={t.caseId}><legend>{t.caseId}</legend>{(["gamma","psi"] as const).map(k=><Field key={k} label={`${k} declarado ${t.caseId}`}><Input value={t[k]} onChange={e=>setTerms(terms.map((v,j)=>j===i?{...v,[k]:e.target.value}:v))}/></Field>)}</fieldset>)}
    <button className="button secondary" type="button" onClick={()=>{try{
      const number=(s:string)=>{if(!s.trim())throw Error("Informe todos os fatores, inclusive zeros.");return Number(s.replace(",","."));};
      const updated={...combination,purpose,hypothesis,reference,terms:terms.map(t=>({...t,gamma:number(t.gamma),psi:number(t.psi),reference}))};
      const next=applyEngineeringCombinations(project,{...declarations,combinations:declarations.combinations.map(c=>c.id===combination.id?updated:c)});
      onChange({workspace:next.workspace});setMessage("Combinação registrada; recalcule os esforços antes de verificar resistência.");
    }catch(e){setMessage((e as Error).message);}}}>Registrar revisão da combinação e invalidar análise</button>{message&&<p role="status">{message}</p>}
  </div>;
}
