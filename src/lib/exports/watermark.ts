import {GState,type jsPDF} from "jspdf";

/**
 * Marca d'água Shimizu nas folhas em PDF (pedido do Tom, nov/2026).
 * As pranchas saem completas o bastante para um engenheiro de fora só assinar; a marca deixa claro
 * de onde o projeto saiu. Inibe, mas não impede: PDF pode ser editado. O DXF é editável e fica interno,
 * por isso não leva marca.
 */
export const WATERMARK_BRAND="Shimizu";
export type Watermark={brand:string;client:string;issuedAt:Date};

export function watermarkLines(w:Watermark):[string,string]{
  const date=w.issuedAt.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});
  const client=w.client.trim();
  return [`${w.brand} · uso exclusivo · cópia para orçamento`,`${client?`Cliente: ${client} · `:""}${date}`];
}

/** Carimba todas as páginas já desenhadas: texto em diagonal, cinza bem claro e transparente,
 * por cima do desenho sem esconder as medidas. Chamar no final, depois de desenhar tudo. */
export function stampWatermark(doc:jsPDF,w:Watermark){
  const [main,sub]=watermarkLines(w);
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
    const diagonal=Math.hypot(width,height),angle=Math.atan2(height,width)*180/Math.PI;
    // Tamanho proporcional à folha (A4 até A1): a frase ocupa ~60 % da diagonal.
    const size=Math.max(14,Math.min(90,diagonal*.6/(main.length*.55)*72/25.4));
    const rad=angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
    // Escreve a partir da ponta esquerda, subindo na diagonal (y do PDF cresce para baixo).
    const line=(value:string,offset:number)=>{
      const half=doc.getTextWidth(value)/2,cx=width/2+offset*sin,cy=height/2+offset*cos;
      doc.text(value,cx-half*cos,cy+half*sin,{angle});
    };
    doc.saveGraphicsState();
    doc.setGState(new GState({opacity:.12}));
    doc.setTextColor(120,120,120);
    doc.setFont("helvetica","bold");doc.setFontSize(size);line(main,0);
    doc.setFont("helvetica","normal");doc.setFontSize(size*.5);line(sub,size*25.4/72*.9);
    doc.restoreGraphicsState();
  }
}
