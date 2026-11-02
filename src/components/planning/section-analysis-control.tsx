"use client";
import { useEffect,useRef,useState } from "react";
import type { Project } from "@/domain/models";
import { sectionAnalysisRequestSchema,sectionAnalysisResultSchema } from "@/domain/section-analysis";
import { mixedInputHash } from "@/domain/mixed-analysis";
import { Field,Input } from "@/components/ui";
import { downloadText } from "@/lib/format";

export function SectionAnalysisControl({project,pieceId}:{project:Project;pieceId:string}){
  const d=project.workspace.spatialPreparation?.resistance?.find(p=>p.pieceId===pieceId),g=d?.geometry;
  const [responsible,setResponsible]=useState(d?.coldFormed?.responsible??""),[target,setTarget]=useState("0.001"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [result,setResult]=useState<{identity:string;value:ReturnType<typeof sectionAnalysisResultSchema.parse>}|null>(null),pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const [poisson,setPoisson]=useState("");
  const keys=g?.shape==="i"?["height","width","webThickness","flangeThickness","insideRadius"]:["height","width","wallThickness","lip","insideRadius"];
  const request=sectionAnalysisRequestSchema.safeParse({schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:g?.shape,...Object.fromEntries(keys.map(k=>[k,g?.dimensionsMm[k as keyof typeof g.dimensionsMm]]))},poisson:poisson.trim()?Number(poisson.replace(",",".")):null,source:g?.source,revision:g?.revision,responsible,convergence:Number(target.replace(",","."))});
  const identity=request.success?JSON.stringify(request.data):"",current=result?.identity===identity?result.value:null;
  return <details data-testid="section-analysis"><summary>Calcular propriedades físicas da seção — Python real</summary>
    <p>Usa sectionproperties 3.10.2: área, inércias, torção, empenamento e centro de cisalhamento, com três malhas. Geometria física cadastrada; nenhuma dimensão do desenho provisório é utilizada. Eixos: largura em y local, altura em z local; origem no canto inferior esquerdo. Não altera a seção do solver automaticamente.</p>
    {!g||!["i","u-stiffened"].includes(g.shape)?<p>Cadastre geometria física I/W ou Ue completa para usar este procedimento.</p>:<>
      <Field label="Poisson declarado para análise da seção"><Input value={poisson} onChange={e=>setPoisson(e.target.value)}/></Field>
      <Field label="Responsável pela análise da seção"><Input value={responsible} onChange={e=>setResponsible(e.target.value)} maxLength={1000}/></Field>
      <Field label="Alvo numérico relativo de refinamento"><Input value={target} onChange={e=>setTarget(e.target.value)}/></Field>
      <button type="button" className="button secondary" disabled={busy||!request.success} onClick={async()=>{if(!request.success)return;pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setMessage("");try{
        const response=await fetch("/api/experimental/section",{method:"POST",headers:{"Content-Type":"application/json"},body:identity,signal:controller.signal}),out=await response.json();if(!response.ok)throw Error(out.error?.message??"Seção recusada.");
        const value=sectionAnalysisResultSchema.parse(out.result);if(value.input_sha256!==await mixedInputHash(request.data))throw Error("Propriedades obsoletas/incompatíveis.");if(!controller.signal.aborted)setResult({identity,value});
      }catch(e){if(!controller.signal.aborted)setMessage((e as Error).message);}finally{if(pending.current===controller)setBusy(false);}}}>Calcular seção física local</button>
    </>}
    {message&&<p role="alert">{message}</p>}{current&&<div data-testid="section-properties-result"><button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify({schema_version:"jpn.section-calculation-record/1",projectId:project.id,pieceId,input:request.success?request.data:null,result:current},null,2),`section-${pieceId}.json`)}>Exportar cálculo da seção</button><p>Convergência numérica: {current.convergence.status}; {current.refinements.map(r=>r.nodes).join(" → ")} nós. Diferenças de refinamento não são limite de erro certificado. Propriedades efetivas e resistência normativa não calculadas.</p><dl>{Object.entries(current.properties).map(([k,v])=><div key={k}><dt>{k} (unidade indicada no nome)</dt><dd>{v.toExponential(7)}</dd></div>)}</dl><p style={{overflowWrap:"anywhere"}}>Entrada: {current.input_sha256}; fonte/revisão: {current.source.source} / {current.source.revision}.</p></div>}
  </details>;
}
