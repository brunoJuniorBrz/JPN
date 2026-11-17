import type {Project} from "@/domain/models";
import {packBars,projectCutting} from "@/domain/calculations/cutting";
import {structureSignature} from "@/domain/calculations/project-basis";
import {calculateEstimate} from "@/domain/calculations/estimate";
import {jsPDF} from "jspdf";
import {autoTable} from "jspdf-autotable";
import {createCadDrawing,type CadExportOptions} from "./cad";
import {createCadPdf} from "./cad-pdf";
import {packageTakeoff} from "./package-source";
import {declaredCommercialGroups,isUnlocatedCommercialPiece} from "./package-commercial-groups";
import {reviewSourceDimensions} from "./package-dimension-review";
import {createPackageZip} from "./package-zip";
import {CAD_NOTICE} from "./cad-book";
import {mixedPreparationReview} from "@/domain/mixed-adapter";
import {newSpatialPreparation} from "@/domain/spatial-preparation";

export type PackageOptions=CadExportOptions&{issuedAt?:Date;stockByGroup?:Record<string,number>;barPriceCentsByGroup?:Record<string,number>};
const encoder=new TextEncoder();
const csv=(rows:unknown[][])=>"\ufeff"+rows.map(row=>row.map(v=>`"${String(v??"PENDENTE").replace(/"/g,'""').replace(/^[=+@\-\t\r]/,"'$&")}"`).join(";")).join("\r\n");
const safe=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,90)||"obra";
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,"0")).join("");
export function packageCutting(project:Project,options:PackageOptions={}){
  if(!project.workspace.physicalStructure){
    const original=projectCutting(project),c=project.workspace.cutting;
    return {...original,groups:original.groups.map(g=>({...g,...packBars({
      stockMm:g.bars[0].stockMm,
      pieces:g.bars.flatMap(b=>b.pieces.map(p=>({id:p.id,lengthMm:Math.ceil(p.lengthMm-1e-9)}))),
      kerfMm:c.kerfMm!,endTrimMm:c.endTrimMm!,minimumRemnantMm:c.minimumRemnantMm!,
    })}))};
  }
  const config=project.workspace.cutting,report=packageTakeoff(project),signature=structureSignature(project);
  if(config.kerfMm===null||config.endTrimMm===null||config.minimumRemnantMm===null)
    throw Error("Declare serra, perdas de extremidade e sobra mínima; zero deve ser explícito.");
  const piecesById=new Map(report.pieces.map(p=>[p.pieceId,p]));
  const catalog=project.workspace.spatialPreparation?.physicalCatalog;
  return {status:"simulation_only" as const,signature,groups:declaredCommercialGroups(project).map((g,i)=>{
    const candidate=[options.stockByGroup?.[g.key],...g.legacyKeys.map(k=>options.stockByGroup?.[k])]
      .filter((v):v is number=>v!==undefined);
    const lengths=[...new Set(candidate)];
    if(lengths.length>1)throw Error(`${g.label}: estoque conflitante entre funções do mesmo perfil; escolha um comprimento comercial único.`);
    const stockMm=lengths[0];
    if(!g.sectionId||!g.materialId||!g.steelGrade.trim())
      throw Error(`${g.label}: perfil ou material pendente.`);
    if(!stockMm)throw Error(`${g.label}: declare o comprimento comercial em mm nas opções do pacote.`);
    const items=g.pieceIds.map(id=>{
      const p=piecesById.get(id)!;
      const assignment=catalog?.assignments.find(a=>a.pieceId===p.pieceId);
      if(!catalog?.sections.find(s=>s.id===assignment?.sectionId)?.designation?.trim())
        throw Error(`${p.pieceId}: identificação do perfil pendente no catálogo físico.`);
      const final=project.workspace.fabrication.find(f=>f.pieceId===p.pieceId&&f.signature===signature);
      if(config.useFabrication&&!final)throw Error(`${p.pieceId}: comprimento final ausente ou desatualizado.`);
      // CSV/PDF/shop lengths are integer millimetres, never rounded DOWN.
      // Exact geometric lengths remain in the snapshot/materials/audit.
      return {id:p.pieceId,lengthMm:Math.ceil((config.useFabrication?final!.lengthMm:p.lengthMm)-1e-9)};
    });
    const all=packBars({stockMm,pieces:items,kerfMm:config.kerfMm!,
      endTrimMm:config.endTrimMm!,minimumRemnantMm:config.minimumRemnantMm!});
    const confirmed=items.filter(p=>!g.unlocatedPieceIds.includes(p.id));
    const confirmedStandalone=confirmed.length?packBars({stockMm,pieces:confirmed,
      kerfMm:config.kerfMm!,endTrimMm:config.endTrimMm!,minimumRemnantMm:config.minimumRemnantMm!}):null;
    return {profile:g.label,commercialKey:g.key,groupId:`G${i+1}`,unlocatedPieceIds:g.unlocatedPieceIds,
      confirmedStandaloneBars:confirmedStandalone?.bars.length??0,...all};
  })};
}
export async function createCompletePackage(input:Project,options:PackageOptions={}){
  // Snapshot before the first await: every file and hash refers to this revision.
  const project=structuredClone(input),issuedAt=options.issuedAt??new Date(),takeoff=packageTakeoff(project),drawing=createCadDrawing(project,issuedAt,options);
  const reviews=reviewSourceDimensions(project),reviewById=new Map(reviews.map(r=>[r.pieceId,r]));
  const unlocated=takeoff.pieces.filter(p=>isUnlocatedCommercialPiece(p)),unlocatedIds=new Set(unlocated.map(p=>p.pieceId));
  const pending=[CAD_NOTICE,"Bases e chumbadores A4/A5, ligações, soldas, fundações, cargas e estabilidade: verificar pendências do projeto. Comprimentos entre nós não incluem detalhes de fabricação."];
  const preparation=project.workspace.spatialPreparation??newSpatialPreparation(project);
  pending.push(...mixedPreparationReview(project,preparation,!!preparation.loading).issues.map(i=>`${i.code}: ${i.message}`));
  if(project.technicalNotes.trim())pending.push(`Observações técnicas do projeto: ${project.technicalNotes}`);
  if(takeoff.totals.massKg===null)pending.push("Massa incompleta: propriedades ou densidades ausentes permanecem PENDENTE.");
  for(const r of reviews.filter(r=>r.status==="PENDENTE"))pending.push(
    `PENDENTE — DIVERGÊNCIA DIMENSIONAL: ${r.pieceId}; fonte ${r.declaredMm} mm; modelo ${r.actualMm??"sem peça"} mm; diferença ${r.discrepancyMm??"indefinida"} mm. ${r.source} (${r.revision}). ${r.note}`);
  if(unlocated.length)pending.push(`PENDENTE: ${unlocated.length} peças sem locação confirmada, excluídas do escopo principal e listadas em materiais/itens-a-confirmar.csv.`);

  let cutting:ReturnType<typeof packageCutting>|null=null;
  try{cutting=packageCutting(project,options);}catch(e){pending.push(`Plano de corte indisponível: ${e instanceof Error?e.message:String(e)}`);}
  const files:{name:string;mime:string;bytes:Uint8Array}[]=[];
  const add=(name:string,mime:string,value:string|ArrayBuffer)=>files.push({name,mime,bytes:typeof value==="string"?encoder.encode(value):new Uint8Array(value)});
  add("cad/pranchas.dxf","application/dxf",drawing.dxf);add("pranchas/pranchas.pdf","application/pdf",createCadPdf(drawing.sheets));
  const materialHeaders=["ID","Perfil","Material","Quantidade","Comprimento geométrico mm","Massa linear kg/m","Massa kg","Preço cadastrado centavos/m","Cota fonte mm","Diferença mm","Conferência dimensional"];
  const materialRow=(p:typeof takeoff.pieces[number])=>{const review=reviewById.get(p.pieceId);
    return [p.pieceId,p.profile,p.steelGrade||"PENDENTE",1,p.lengthMm,
      p.massKg===null?null:p.massKg/(p.lengthMm/1000),p.massKg,p.pricePerMeterCents,
      review?.declaredMm??"NÃO DECLARADA",review?.discrepancyMm??"NÃO CONFERIDA",review?.status??"SEM COTA"];};
  add("materiais/lista.csv","text/csv;charset=utf-8",csv([materialHeaders,
    ...takeoff.pieces.filter(p=>!unlocatedIds.has(p.pieceId)).map(materialRow)]));
  if(unlocated.length)add("materiais/itens-a-confirmar.csv","text/csv;charset=utf-8",csv([
    materialHeaders,...unlocated.map(materialRow)]));
  const cutRows=cutting?.groups.flatMap(g=>g.bars.flatMap(b=>b.pieces.map(p=>[
    g.groupId,g.profile,b.id,b.stockMm,p.id,Math.ceil(p.lengthMm),b.kerfMm,b.trimMm,
    b.remainderMm,b.reusableMm,b.wasteMm,g.utilizationPercent,
    unlocatedIds.has(p.id)?"A CONFIRMAR":"PRINCIPAL",
    reviewById.get(p.id)?.status??"COTA NÃO INFORMADA"])))??[];
  if(cutting)add("corte/plano.csv","text/csv;charset=utf-8",csv([["Grupo","Perfil/material","Barra","Comercial mm","ID peça","Corte mm","Serra total barra mm","Pontas total barra mm","Sobra barra mm","Reutilizável barra mm","Desperdício barra mm","Aproveitamento grupo %","Escopo","Conferência dimensional"],...cutRows]));
  else add("corte/PENDENTE.txt","text/plain;charset=utf-8",pending.at(-1)!);
  const commercial=cutting?.groups.map(g=>{
    const price=options.barPriceCentsByGroup?.[
      "commercialKey" in g&&typeof g.commercialKey==="string"?g.commercialKey:g.groupId
    ]??null;
    const confirmedBars="confirmedStandaloneBars" in g&&typeof g.confirmedStandaloneBars==="number"
      ?g.confirmedStandaloneBars:g.bars.length;
    const reuseMm=g.bars.reduce((v,b)=>v+b.reusableMm,0);
    const wasteMm=g.bars.reduce((v,b)=>v+b.wasteMm,0);
    return {profile:g.profile,groupId:g.groupId,barCountCombined:g.bars.length,
      barCountMain:confirmedBars,pendingBarCountIfPurchasedTogether:g.bars.length-confirmedBars,
      stockMm:g.bars[0]?.stockMm??null,reusableMm:reuseMm,wasteMm,
      barPriceCents:price,
      costMainCents:price===null?null:confirmedBars*price,
      costCombinedCents:price===null?null:g.bars.length*price,
      costPendingIncrementalCents:price===null?null:(g.bars.length-confirmedBars)*price};
  })??[];
  const sumKnown=(key:"costMainCents"|"costCombinedCents"|"costPendingIncrementalCents")=>
    commercial.length&&commercial.every(g=>g[key]!==null)?commercial.reduce((a,g)=>a+g[key]!,0):null;
  const doc=new jsPDF({unit:"mm",format:"a4"}),estimate=calculateEstimate(project);
  const table=(title:string,head:string[],body:(string|number)[][])=>{
    if(doc.getNumberOfPages()>1||title!=="Memorial de quantitativos")doc.addPage();
    doc.setFontSize(14);doc.text(title,14,17);
    autoTable(doc,{startY:25,margin:{top:25,bottom:24},head:[head],body,styles:{fontSize:8,overflow:"linebreak"},didDrawPage:()=>{doc.setFontSize(8);doc.text("PRELIMINAR - NAO UTILIZAR PARA EXECUCAO OU CORTE",14,285);}});
  };
  table("Memorial de quantitativos",["Parâmetro","Valor"],[
    ["Obra / ID",`${project.name} / ${project.id}`],["Revisão",takeoff.modelRevision],["Emissão",issuedAt.toISOString()],
    ["Origem",project.workspace.physicalStructure?"Estrutura declarada pelo projeto":"Estrutura gerada pelos parâmetros da interface"],
    ["Parâmetros",JSON.stringify(project.workspace.physicalStructure?{revision:takeoff.modelRevision}:project.roof)],
    ["Premissas informadas",project.planning?.specificationNotes||"PENDENTE"],["Peças",takeoff.totals.quantity],["Comprimento geométrico m",takeoff.totals.lengthM],
    ["Massa total kg",takeoff.totals.massKg??"PENDENTE"],["Corte",`${cutting?"First Fit Decreasing; heurístico, sem prova de mínimo global":"INDISPONÍVEL"}; ${project.workspace.cutting.useFabrication?"comprimentos finais declarados":"comprimentos geométricos"}`],
    ["Configuração do corte",JSON.stringify(project.workspace.cutting)],["Custos",`Cadastro comercial existente (PODE incluir itens sem locação): materiais conhecidos ${estimate.materialsCents/100} BRL; total conhecido ${estimate.totalCostCents/100} BRL. Subtotal de barras PRINCIPAL: ${sumKnown("costMainCents")===null?"PENDENTE":(sumKnown("costMainCents")!/100).toFixed(2)} BRL; cenário COM itens a confirmar: ${sumKnown("costCombinedCents")===null?"PENDENTE":(sumKnown("costCombinedCents")!/100).toFixed(2)} BRL. Os subtotais de barras não incluem itens sem preço declarado ou demais componentes da obra.`],
  ]);
  table("Resumo de materiais",["Perfil/material","Qtd.","m","kg"],takeoff.groups.map(g=>[g.label,g.quantity,g.lengthM,g.massKg??"PENDENTE"]));
  if(cutting)table("Plano de corte - simulação heurística",["Perfil/barra","Peças e cortes mm","Serra / pontas mm","Sobra / reutilizável mm"],cutting.groups.flatMap(g=>g.bars.map(b=>[
    `${g.profile} / ${g.groupId}-${b.id}`,b.pieces.map(p=>`${p.id}: ${Math.ceil(p.lengthMm)}`).join("; "),
    `${b.kerfMm} / ${b.trimMm}`,`${b.remainderMm} / ${b.reusableMm}`])));
  if(commercial.length)table("Compra de barras e saldos",["Perfil","Principal / com itens a confirmar","Sobra reaproveitável mm","Perda / custo R$"],commercial.map(g=>[
    g.profile,`${g.barCountMain} / ${g.barCountCombined} barras`,
    g.reusableMm,`${g.wasteMm} mm / ${g.costMainCents===null?"PENDENTE":(g.costMainCents/100).toFixed(2)} (principal); itens sem locação +${g.costPendingIncrementalCents===null?"PENDENTE":(g.costPendingIncrementalCents/100).toFixed(2)} BRL`]));
  if(unlocated.length)table("ITENS A CONFIRMAR - SEM LOCAÇÃO",["ID","Perfil","Comprimento mm"],unlocated.map(p=>[
    p.pieceId,p.profile,Math.ceil(p.lengthMm)]));
  if(reviews.length)table("Conferência de cotas declaradas",["ID","Fonte mm","Entre nós mm","Diferença / status"],reviews.map(r=>[
    r.pieceId,r.declaredMm,r.actualMm??"PENDENTE",`${r.discrepancyMm??"PENDENTE"} / ${r.status}`]));
  table("Premissas e pendências",["Conferência"],[...pending,...estimate.pending,...estimate.warnings].map(p=>[p]));
  add("memorial/quantitativos.pdf","application/pdf",doc.output("arraybuffer"));
  add("rastreabilidade/projeto.json","application/json",JSON.stringify(project,null,2));
  const manifest={schema_version:"jpn.documentation-package/1",projectId:project.id,revision:takeoff.modelRevision,issuedAt:issuedAt.toISOString(),
    projectSha256:await digest(encoder.encode(JSON.stringify(project))),format:options.format??"A3",pages:drawing.sheets.map(s=>({name:s.name,title:s.title,widthMm:s.width,heightMm:s.height})),
    totals:takeoff.totals,cuttingAvailable:!!cutting,stockByGroup:options.stockByGroup??{},
    commercial,commercialCostMainCents:sumKnown("costMainCents"),commercialCostCombinedCents:sumKnown("costCombinedCents"),
    commercialCostPendingIncrementalCents:sumKnown("costPendingIncrementalCents"),
    unlocatedPieceIds:[...unlocatedIds],sourceDimensionReviews:reviews,pending,
    computedStructuralApproval:false,fabricationRelease:false,releaseGate:"NOT_READY_BLOCKED",
    files:await Promise.all(files.map(async f=>({name:f.name,bytes:f.bytes.length,sha256:await digest(f.bytes)})))};
  add("manifesto.json","application/json",JSON.stringify(manifest,null,2));
  const root=`${safe(project.name)}-rev-${safe(takeoff.modelRevision)}`;
  return {name:`${root}.zip`,files,manifest,zip:createPackageZip(files.map(f=>({name:`${root}/${f.name}`,bytes:f.bytes})))};
}
