import type { Project } from "@/domain/models";
import { buildPreproductionDossier } from "@/domain/calculations/preproduction";

const warning="PRÉ-FABRICAÇÃO — DOCUMENTO PRELIMINAR. NÃO É ORDEM DE COMPRA, CORTE OU FABRICAÇÃO.";
const mm=(n:number|null)=>n===null?"PENDENTE":n.toFixed(2);
const kg=(n:number|null)=>n===null?"PENDENTE":n.toFixed(3);

export async function createPreproductionPdf(project:Project):Promise<ArrayBuffer>{
  const report=buildPreproductionDossier(project);
  const [{jsPDF},{autoTable}]=await Promise.all([import("jspdf"),import("jspdf-autotable")]);
  const doc=new jsPDF({orientation:"landscape",format:"a4"});
  doc.setProperties({title:`Dossiê preliminar de materiais - ${project.name}`,author:"JPN - módulo de planejamento"});
  doc.setFontSize(16);doc.text("DOSSIÊ DE PRÉ-FABRICAÇÃO — PRELIMINAR",12,15);
  doc.setFontSize(10);
  doc.text(`Obra: ${report.projectName} · Revisão da geometria: ${report.roofRevision} · ${report.pieces.length} peças`,12,23);
  doc.text("Quantidades geométricas do modelo; comprimentos finais apenas quando declarados nesta revisão.",12,30);
  doc.text("Não foram detalhados nem dimensionados ligações, contraventamentos e fixadores.",12,37);
  const issueCount=new Map<string,{message:string,count:number,exampleIds:string[]}>();
  for(const issue of report.issues){
    const key=`${issue.code}:${issue.message}`;
    const found=issueCount.get(key)??{message:issue.message,count:0,exampleIds:[]};
    found.count++;
    if(issue.pieceId && found.exampleIds.length<4)found.exampleIds.push(issue.pieceId);
    issueCount.set(key,found);
  }
  autoTable(doc,{
    startY:44,margin:{left:12,right:12,bottom:18},styles:{fontSize:8,cellPadding:2,overflow:"linebreak"},
    head:[["Família","Perfil / aço","Qtd.","Geom. total (mm)","Final declarado (mm)","Massa conhecida (kg)","IDs"]],
    body:report.groups.map(g=>[
      g.role,`${g.profileName||"A definir"} / ${g.steelGrade||"A definir"}`,
      String(g.quantity),mm(g.geometricTotalMm),mm(g.finalDeclaredTotalMm),kg(g.massKg),
      g.ids.length>25 ? `${g.ids.slice(0,25).join(", ")} ... (${g.ids.length} IDs na planilha)` : g.ids.join(", "),
    ]),
    headStyles:{fillColor:[40,51,54]},
  });
  doc.addPage();
  doc.setFontSize(13);doc.text("PENDÊNCIAS DE ENGENHARIA E FABRICAÇÃO",12,17);
  autoTable(doc,{
    startY:24,margin:{left:12,right:12,bottom:18},styles:{fontSize:8,cellPadding:2,overflow:"linebreak"},
    head:[["Pendência","Ocorrências","Amostras de peças (demais na planilha)"]],
    body:[...issueCount.values()].map(v=>[v.message,String(v.count),v.exampleIds.join(", ")||"—"]),
    headStyles:{fillColor:[40,51,54]},
  });
  doc.addPage();
  doc.setFontSize(13);doc.text("RESUMO DA SIMULAÇÃO DE CORTE — NÃO É ORDEM DE CORTE",12,17);
  if(report.cutting){
    autoTable(doc,{
      startY:24,margin:{left:12,right:12,bottom:18},styles:{fontSize:7,cellPadding:2,overflow:"linebreak"},
      head:[["Grupo/perfil","Barra","Comprimento barra (mm)","Peças (mm)","Perdas corte + pontas (mm)","Sobra (mm)"]],
      body:report.cutting.groups.flatMap(g=>g.bars.map(b=>[
        g.profile,`${g.groupId}-${b.id}`,mm(b.stockMm),
        b.pieces.map(p=>`${p.id}:${mm(p.lengthMm)}`).join(", "),
        mm(b.kerfMm+b.trimMm),mm(b.remainderMm)
      ])),headStyles:{fillColor:[40,51,54]}
    });
  }else doc.text("Simulação indisponível: veja os parâmetros pendentes na página anterior.",12,30);
  for(let i=1;i<=doc.getNumberOfPages();i++){
    doc.setPage(i);
    const h=doc.internal.pageSize.getHeight();
    doc.setFontSize(8);doc.setTextColor(160,20,20);
    doc.text(warning,12,h-9);
    doc.setTextColor(50,50,50);doc.text(`${i}/${doc.getNumberOfPages()}`,286,h-9,{align:"right"});
  }
  return doc.output("arraybuffer");
}

export async function createPreproductionWorkbook(project:Project):Promise<ArrayBuffer>{
  const report=buildPreproductionDossier(project);
  const {default:ExcelJS}=await import("exceljs");
  const book=new ExcelJS.Workbook();book.creator="JPN - módulo de planejamento";
  const summary=book.addWorksheet("Resumo");
  summary.addRows([
    [warning],
    ["Documento","Dossiê preliminar de pré-fabricação"],
    ["Projeto",report.projectName],
    ["ID",report.projectId],
    ["Revisão geométrica",report.roofRevision],
    ["Assinatura geométrica (identidade dos dados)",report.geometrySignature],
    ["Peças",report.totals.pieces],
    ["Grupos",report.totals.groups],
    ["Comprimento geométrico total (mm)",report.totals.geometricLengthMm],
    ["Massa conhecida (kg)",report.totals.knownMassKg],
    ["Massa completa?",report.totals.completeMass?"Sim":"Não"],
    ["Comprimentos finais declarados nesta revisão?",report.totals.fullyDeclaredFinalLengths?"Sim (não verificados)":"Não"],
    ["Barras comerciais simuladas",report.totals.simulatedStockBars??"Pendente"],
    ["Status",report.status],
    ["Aprovado para fabricação?","NÃO"],
    ["Uso permitido",report.allowedUse],
    ["Limites","Sem detalhamento completo de ligações, estabilidade, vento normativo e aprovação da obra"],
  ]);
  const groups=book.addWorksheet("Grupos de materiais");
  groups.addRow(["Família","Perfil","Classe de aço","Fonte","Compr. comercial (m)","Qtd. peças","Total geométrico (mm)","Total final declarado (mm)","Massa conhecida (kg)","IDs das peças"]);
  report.groups.forEach(g=>groups.addRow([
    g.role,g.profileName||"Pendente",g.steelGrade||"Pendente",g.profileSource,
    g.stockLengthM??"Pendente",g.quantity,g.geometricTotalMm,
    g.finalDeclaredTotalMm??"Pendente",g.massKg??"Pendente",g.ids.join(", "),
  ]));
  const pieces=book.addWorksheet("Peças");
  pieces.addRow(["ID","Família","Perfil","Aço","Origem do perfil","Nó inicial","Nó final","Compr. geométrico (mm)","Compr. final declarado (mm)","Estado do comprimento","Nota de fabricação","Massa linear (kg/m)"]);
  report.pieces.forEach(p=>pieces.addRow([
    p.id,p.role,p.profileName,p.steelGrade,p.profileSource,p.startNode,p.endNode,
    p.geometricLengthMm,p.finalDeclaredLengthMm??"Pendente",p.finalLengthState,p.finalLengthNote??"",p.massKgM??"Pendente",
  ]));
  const cuts=book.addWorksheet("Corte simulado");
  cuts.addRow(["Grupo","Perfil / aço","Barra","Comprimento comercial (mm)","Peças / comprimentos (mm)","Perda corte (mm)","Perda extremos (mm)","Sobra (mm)","Sobra reaproveitável (mm)","Desperdício (mm)","Situação"]);
  for(const g of report.cutting?.groups??[])for(const b of g.bars)cuts.addRow([
    g.groupId,g.profile,b.id,b.stockMm,b.pieces.map(p=>`${p.id}: ${p.lengthMm.toFixed(3)}`).join("; "),
    b.kerfMm,b.trimMm,b.remainderMm,b.reusableMm,b.wasteMm,"SIMULAÇÃO — NÃO CORTAR",
  ]);
  const issues=book.addWorksheet("Pendências por peça");
  issues.addRow(["Código","Peça (se aplicável)","Pendência"]);
  report.issues.forEach(i=>issues.addRow([i.code,i.pieceId??"GLOBAL",i.message]));

  for(const sheet of book.worksheets){
    sheet.views=[{state:"frozen",ySplit:sheet===summary?0:1}];
    sheet.columns.forEach(column=>{column.width=sheet===summary?38:26;});
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF30393B"}};
    sheet.eachRow(row=>{row.alignment={vertical:"top",wrapText:true};});
  }
  return new Uint8Array(await book.xlsx.writeBuffer()).buffer;
}
