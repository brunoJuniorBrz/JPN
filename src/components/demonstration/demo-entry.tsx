"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {useData} from "@/components/data-provider";
import {createTomDemonstration} from "@/domain/client-demonstration";
import {VALIDATION_NOTICE} from "@/domain/demonstration-schema";
import type {Project} from "@/domain/models";

export function DemonstrationNotice({project}:{project:Project}){
  const kind=project.workspace.demonstration?.kind;
  if(!kind)return null;
  return <p className="notice demo-permanent-warning" role="note" data-testid="demo-permanent-warning">{kind==="mathematical-validation"?VALIDATION_NOTICE:"DEMONSTRAÇÃO COMERCIAL TOM — geometria e análise da cobertura real pendentes."} Liberação estrutural e fabricação bloqueadas.</p>;
}
export function TomDemonstrationButton(){
  const {data,saveProject,flush,setInvalidDraft}=useData(),router=useRouter();
  const [error,setError]=useState(""),[opening,setOpening]=useState(false);
  return <div><button type="button" className="button secondary" disabled={opening} onClick={()=>{if(opening)return;setOpening(true);try{
    const p=createTomDemonstration(data.settings);saveProject(p);if(!flush())throw Error("Não foi possível salvar a cópia. Confira o aviso de armazenamento.");
    setInvalidDraft(false);router.push(`/demonstracao?projeto=${p.id}`);
  }catch(e){setError((e as Error).message);setOpening(false);}}}>{opening?"Abrindo cópia da demonstração…":"Abrir demonstração — Cobertura Tom"}</button>{error&&<p role="alert">{error}</p>}</div>;
}
