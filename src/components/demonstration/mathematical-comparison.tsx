"use client";
import {useState} from "react";
import {compareMathematicalReference,verifiedHistoricalDemonstration,historicalSource} from "@/domain/client-demonstration";
import {downloadText} from "@/lib/format";
import {downloadBlob} from "@/lib/exports/proposal";
import {createDemoSummaryPdf} from "@/lib/exports/demonstration";

export function MathematicalComparison({request,result,inputHash,historical=false}:{request:unknown;result:unknown;inputHash:string;historical?:boolean}){
  const [error,setError]=useState(""),comparison=compareMathematicalReference(request,result);
  if(!comparison)return <p className="notice">Modelo alterado: os oráculos da fixture M35 não se aplicam a esta entrada.</p>;
  const rows=[["Flecha Z de B2 (m)",comparison.tipM.toPrecision(10),String(comparison.expectedTipM)],["Reação Z em B0 (N)",comparison.reactionN.toPrecision(10),"200"]];
  return <section className="demo-oracles" data-testid={historical?"historical-comparison":"live-comparison"}>
    <h4>{historical?"Comparação da execução histórica":"Resultado calculado nesta sessão — comparação analítica"}</h4>
    <p>Fixture sintética: balanço de 2 m, E = 200 GPa, I₁ = 10⁻⁶ m⁴, I₂ = 2×10⁻⁶ m⁴, q = −100 N/m. Referência por trabalho virtual documentada na M35; não é dimensionamento normativo.</p>
    <div className="takeoff-table-scroll"><table className="takeoff-table"><thead><tr><th>Grandeza</th><th>Python {historical?"histórico":"da sessão"}</th><th>Oráculo analítico</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}>{r.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></div>
    <p>Diferença de flecha: {comparison.tipDifferenceM.toExponential(3)} m. Entrada SHA-256: <span className="demo-hash">{inputHash}</span>.</p>
    <button type="button" className="button secondary" onClick={()=>{void(async()=>{try{
      const origin=historical?`HISTÓRICO registrado no commit ${historicalSource.commit}; ${historicalSource.path}`:"Resultado recebido do worker Python nesta sessão; não é resultado histórico";
      const bytes=await createDemoSummaryPdf(historical?"Validação matemática — HISTÓRICO":"Validação matemática — execução real",[["Origem",origin],["Entrada SHA-256",inputHash],...rows.map(r=>[r[0],`${r[1]} · analítico: ${r[2]}`])],"MODELO MATEMÁTICO — NÃO REPRESENTA A ESTRUTURA DO TOM. Sem aprovação estrutural ou de fabricação.");
      downloadBlob(new Blob([bytes],{type:"application/pdf"}),historical?"jpn-validacao-historica.pdf":"jpn-validacao-calculada.pdf");
    }catch(e){setError((e as Error).message);}})();}}>Exportar resumo {historical?"histórico":"do cálculo"} PDF</button>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
export function HistoricalDemonstration(){
  const [evidence,setEvidence]=useState<Awaited<ReturnType<typeof verifiedHistoricalDemonstration>>|null>(null),[error,setError]=useState("");
  return <details className="technical-details demo-history"><summary>Execução anterior verificada — evidência histórica</summary>
    <p><strong>HISTÓRICO: não foi recalculado para esta cópia nem nesta sessão.</strong> Registro no commit <a href={historicalSource.url} target="_blank" rel="noreferrer">{historicalSource.commit}</a>, arquivo {historicalSource.path}. Origem: execução real de validação M35, PyNiteFEA 3.2.1. Não representa a cobertura real do Tom.</p>
    {!evidence&&<button type="button" className="button secondary" onClick={()=>{void verifiedHistoricalDemonstration().then(setEvidence).catch(e=>setError((e as Error).message));}}>Consultar evidência histórica verificada</button>}
    {error&&<p role="alert">Evidência não apresentada: {error}</p>}
    {evidence&&<><p role="status">Integridade, entrada, versão e rastreabilidade da evidência conferidas. Sua natureza continua histórica.</p><MathematicalComparison request={evidence.request} result={evidence.result} inputHash={evidence.inputHash} historical/>
      <button type="button" className="button secondary" onClick={()=>downloadText(JSON.stringify(evidence,null,2),"jpn-evidencia-historica-m35.json")}>Exportar evidência histórica JSON</button></>}
  </details>;
}
