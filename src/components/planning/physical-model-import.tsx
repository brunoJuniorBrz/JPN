"use client";
import { useState,useRef,useEffect } from "react";
import { useRouter } from "next/navigation";
import { newProject,type Project } from "@/domain/models";
import { importPhysicalModel } from "@/domain/physical-model-import";
import { useData } from "@/components/data-provider";
export function NewPhysicalModelImport(){
  const {data,saveProject,flush,setInvalidDraft}=useData(),router=useRouter();
  const [project]=useState(()=>newProject(data.settings));
  return <PhysicalModelImport project={project} onImport={next=>{saveProject(next);if(!flush())throw Error("Não foi possível salvar o projeto importado.");setInvalidDraft(false);router.push(`/projetos/${next.id}?fluxo=levantamento&etapa=3&vista=3d`);}}/>;
}
export function PhysicalModelImport({project,onImport}:{project:Project;onImport:(next:Project)=>void}){
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),ticket=useRef(0);
  useEffect(()=>()=>{ticket.current++;},[]);
  return <details className="technical-details"><summary>Importar modelo estrutural declarado</summary>
    <p>Abra um projeto JPN com estrutura declarada ou um arquivo jpn.declared-structure/1, em mm. A importação preserva a identidade e os dados comerciais desta obra. Geometria sem preparação completa permanece pendente.</p>
    <label>Modelo estrutural JSON<input type="file" accept=".json,application/json" aria-label="Importar modelo estrutural JSON" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value="";if(!file)return;const mine=++ticket.current;setBusy(true);setError("");
      try{if(file.size>5*1024*1024)throw Error("Arquivo excede 5 MB.");const next=importPhysicalModel(project,await file.text());if(ticket.current===mine)onImport(next);}
      catch(e){if(ticket.current===mine)setError(e instanceof Error?e.message:"Modelo estrutural inválido.");}finally{if(ticket.current===mine)setBusy(false);}
    }}/></label>{busy&&<p role="status">Validando modelo…</p>}{error&&<p role="alert">Importação recusada: {error}</p>}
  </details>;
}
