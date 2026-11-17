import {jsPDF} from "jspdf";
import type {CadScene,CadSceneItem} from "./cad-scene";
import {CAD_LAYERS} from "./cad-book";

// The built-in PDF font covers Portuguese in WinAnsi. Explicitly map the few
// CAD symbols outside that encoding rather than emit garbled UTF-16 glyphs.
const text=(value:string)=>value.replace(/−/g,"-").replace(/→/g,"->").replace(/²/g,"²").replace(/√/g,"sqrt");
export function createCadPdf(sheets:CadScene[]):ArrayBuffer{
  if(!sheets.length)throw Error("Nenhuma prancha disponível.");
  const first=sheets[0],doc=new jsPDF({unit:"mm",format:[first.width,first.height],orientation:"landscape",compress:true});
  for(const [i,sheet] of sheets.entries()){
    if(i)doc.addPage([sheet.width,sheet.height],"landscape");
    function draw(items:CadSceneItem[],ox=0,oy=0){
      for(const item of items){
        if(item.kind==="view"){draw(item.items,ox+item.x,oy+item.y);continue;}
        const style=CAD_LAYERS[item.layer as keyof typeof CAD_LAYERS];
        doc.setDrawColor(35);doc.setTextColor(item.layer==="PENDENCIAS"?130:25,25,25);
        doc.setLineWidth((style?.weight??25)/100);
        doc.setLineDashPattern(style?.type==="JPN_EIXO"?[4,1,.5,1]:style?.type==="JPN_TRACEJADO"?[4,2]:[],0);
        if(item.kind==="line")for(let j=1;j<item.points.length;j++)doc.line(ox+item.points[j-1][0],sheet.height-oy-item.points[j-1][1],ox+item.points[j][0],sheet.height-oy-item.points[j][1]);
        else if(item.kind==="circle")doc.circle(ox+item.x,sheet.height-oy-item.y,item.radius);
        else{
          doc.setFontSize(item.height*72/25.4);doc.setFont("helvetica","normal");
          doc.text(text(item.value),ox+item.x,sheet.height-oy-item.y,{align:item.alignment===1?"center":item.alignment===2?"right":"left",angle:item.rotation??0,charSpace:0,horizontalScale:.85});
        }
      }
    }
    draw(sheet.items);
  }
  return doc.output("arraybuffer");
}
