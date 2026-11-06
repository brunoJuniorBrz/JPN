import type {Project} from "@/domain/models";
import {calculateEstimate} from "@/domain/calculations/estimate";
import {technicalDataRows,tomSource} from "@/domain/client-demonstration";

export const demoMoney=(cents:number|null)=>cents===null?"Pendente":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
/** Small summaries using the existing PDF libraries. No fabrication/proposal approval. */
export async function createDemoSummaryPdf(title:string,rows:string[][],note:string){
  const [{jsPDF},{autoTable}]=await Promise.all([import("jspdf"),import("jspdf-autotable")]);
  const printable=(s:string)=>s.replace(/[—–−]/g,"-");
  const doc=new jsPDF();doc.setProperties({title,author:"JPN Projetos"});doc.setFontSize(15);doc.text(printable(title),14,18);
  autoTable(doc,{startY:25,body:rows.map(r=>r.map(printable)),theme:"striped",styles:{fontSize:10,cellPadding:3,overflow:"linebreak"},margin:{bottom:27},didDrawPage:()=>{
    doc.setFontSize(9);doc.text(doc.splitTextToSize(printable(note),180),14,doc.internal.pageSize.getHeight()-20);
  }});
  return doc.output("arraybuffer");
}
export function createCommercialDemoPdf(project:Project){
  const r=calculateEstimate(project);
  return createDemoSummaryPdf("Resumo comercial — Cobertura Tom",[
    ["Obra",project.name],["Cliente",project.client],
    ["Referência auditada original",`${tomSource.roofing_sheet.total_pieces} telhas · ${tomSource.roofing_sheet.total_linear_m.toLocaleString("pt-BR")} m lineares de telha; não é área de cobertura`],
    ...project.estimate.materials.map((l,i)=>[l.name,`${r.materials[i].baseQuantity??"Pendente"} ${l.measurementUnit} · ${demoMoney(r.materials[i].subtotalCents)}`]),
    ...project.estimate.expenses.map(l=>[l.description,`${l.quantity??"Pendente"} ${l.unit} · ${demoMoney(l.quantity!==null&&l.unitPriceCents!==null?Math.round(l.quantity*l.unitPriceCents):null)}`]),
    ["Total comercial atual",demoMoney(r.saleCents)],["Conferências comerciais",r.pending.join("; ")||"Dados comerciais completos para esta demonstração"],
  ],"Referência comercial auditada; não é projeto executivo ou autorização de compra/fabricação. Geometria real pendente.");
}
export function createTechnicalDemoPdf(project:Project){
  return createDemoSummaryPdf("Dados necessários — cobertura real",technicalDataRows(project).map(r=>[r.label,`${r.status}\n${r.information||"Não informado"}\nFonte: ${r.source||"A confirmar"}`]),"NOT_READY_BLOCKED — análise real e fabricação bloqueadas. Informações anotadas exigem confirmação do responsável técnico.");
}
