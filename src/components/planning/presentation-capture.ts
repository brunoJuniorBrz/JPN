import type { PresentationEnvelope } from "./presentation-scene";

export interface PresentationDimensions {
  spanM: number;
  lengthM: number;
  lowHeightM: number;
  highHeightM: number;
}
export function presentationDimensions(e: PresentationEnvelope): PresentationDimensions {
  return { spanM: e.widthM, lengthM: e.lengthM, lowHeightM: e.lowHeightM, highHeightM: e.highHeightM };
}
export function dimensionLabels(d: PresentationDimensions) {
  const f = (v: number) => new Intl.NumberFormat("pt-BR", {maximumFractionDigits:2}).format(v);
  return [`Vão ${f(d.spanM)} m`, `Comprimento ${f(d.lengthM)} m`,
    `Altura baixa ${f(d.lowHeightM)} m`, `Altura máxima ${f(d.highHeightM)} m`];
}
export function drawPresentationAnnotations(
  ctx: CanvasRenderingContext2D, width: number, height: number, title: string,
  dimensions: PresentationDimensions, showDimensions: boolean,
) {
  const pad = Math.max(16, Math.round(width*.025)), scale = Math.max(12,Math.min(25,width/50));
  const lines = showDimensions ? dimensionLabels(dimensions) : [];
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `600 ${scale}px sans-serif`;
  const headerHeight = scale*2.8;
  ctx.fillStyle = "rgba(15,29,35,.82)";
  ctx.fillRect(0,0,width,headerHeight);
  ctx.fillStyle="#ffffff";
  ctx.fillText((title||"JPN · Pré-projeto").slice(0,60),pad,headerHeight/2,width-pad*2);
  if(lines.length){
    const boxW=Math.min(width-pad*2,Math.max(...lines.map(l=>ctx.measureText(l).width))+pad*2);
    const h=lines.length*scale*1.65+pad;
    ctx.fillStyle="rgba(15,29,35,.78)";
    ctx.fillRect(pad,headerHeight+pad,boxW,h);
    ctx.fillStyle="#ffffff";ctx.font=`500 ${scale*.77}px sans-serif`;
    lines.forEach((line,i)=>ctx.fillText(line,pad*1.5,headerHeight+pad*1.6+i*scale*1.65,boxW-pad));
  }
  const footHeight=Math.max(scale*2.5,44);
  ctx.fillStyle="rgba(15,29,35,.9)";ctx.fillRect(0,height-footHeight,width,footHeight);
  ctx.fillStyle="#ffffff";ctx.font=`700 ${Math.max(11,scale*.62)}px sans-serif`;
  ctx.fillText("JPN · VISUALIZAÇÃO PRELIMINAR",pad,height-footHeight*.66,width-pad*2);
  ctx.font=`600 ${Math.max(10,scale*.55)}px sans-serif`;
  ctx.fillText("NÃO É DIMENSIONAMENTO · NÃO LIBERA FABRICAÇÃO",pad,height-footHeight*.29,width-pad*2);
  ctx.restore();
}
