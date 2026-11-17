import {DxfObject,DxfLayer,type Dxfier,type DxfBlock,type DxfWriter,point3d} from "@tarikjabiri/dxf";

export type PaperFormat="A3"|"A1";
export type Point2=[number,number];
export const CAD_NOTICE="PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE";
export const cleanCadText=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g," ");
export const cadNumber=(n:number)=>Number(n.toFixed(3)).toString();
export const CAD_LAYERS={
  COTAS:{color:2,type:"Continuous",weight:13},PERFIS:{color:7,type:"Continuous",weight:35},
  TEXTOS:{color:7,type:"Continuous",weight:18},CARIMBO:{color:7,type:"Continuous",weight:50},
  EIXOS:{color:8,type:"JPN_EIXO",weight:13},COBERTURA:{color:4,type:"Continuous",weight:18},
  APOIOS:{color:3,type:"Continuous",weight:35},MATERIAIS:{color:7,type:"Continuous",weight:18},
  CONTRAVENTOS:{color:6,type:"JPN_TRACEJADO",weight:25},BARRAS_AUXILIARES:{color:8,type:"Continuous",weight:18},
  REACOES:{color:1,type:"Continuous",weight:18},MARCAS:{color:7,type:"Continuous",weight:18},
  column:{color:30,type:"Continuous",weight:35},beam:{color:7,type:"Continuous",weight:35},
  topChord:{color:3,type:"Continuous",weight:35},bottomChord:{color:3,type:"Continuous",weight:35},
  web:{color:8,type:"Continuous",weight:18},purlin:{color:4,type:"Continuous",weight:25},
  IDENTIFICACAO:{color:7,type:"Continuous",weight:18},PRELIMINAR:{color:1,type:"Continuous",weight:25},
} as const;

class OfficeLayer extends DxfLayer{
  constructor(name:string,color:number,lineType:string,readonly weight:number){super(name,color,lineType);}
  dxfy(dx:Dxfier){super.dxfy(dx);dx.push(370,this.weight);}
}
/** Native, bidirectionally linked LAYOUT / BLOCK_RECORD objects. */
class SheetLayout extends DxfObject{
  constructor(readonly name:string,readonly order:number,readonly record:string,owner:string,readonly width:number,readonly height:number,readonly format:PaperFormat){super("LAYOUT");this.ownerObjecthandle=owner;}
  dxfy(dx:Dxfier){
    super.dxfy(dx);dx.push(100,"AcDbPlotSettings");dx.push(1,"");dx.push(4,`ISO_${this.format}_(${this.width}.00_x_${this.height}.00_MM)`);
    dx.push(40,10);dx.push(41,10);dx.push(42,10);dx.push(43,10);dx.push(44,this.width);dx.push(45,this.height);
    dx.push(70,0);dx.push(72,1);dx.push(73,0);dx.push(74,5);dx.push(142,1);dx.push(143,1);dx.push(147,1);
    dx.push(100,"AcDbLayout");dx.push(1,this.name);dx.push(70,1);dx.push(71,this.order);
    dx.point2d({x:0,y:0});dx.point2d({x:this.width,y:this.height},1);dx.point3d(point3d(0,0),2);dx.point3d(point3d(0,0),3);
    dx.point3d(point3d(0,0),4);dx.point3d(point3d(this.width,this.height),5);dx.push(146,0);dx.point3d(point3d(1,0),6);dx.point3d(point3d(0,1),7);dx.push(76,0);dx.push(330,this.record);
  }
}

type Page={name:string;scale:number|null;draw:(space:DxfBlock)=>void};
export class CadBook{
  readonly width:number;readonly height:number;
  readonly pages:Page[]=[];
  private current=0;
  constructor(readonly dxf:DxfWriter,readonly format:PaperFormat,readonly job:string,readonly revision:string,readonly issuedAt:Date){
    if(format!=="A3"&&format!=="A1")throw Error("Formato CAD não suportado; use A3 ou A1.");
    [this.width,this.height]=format==="A1"?[841,594]:[420,297];
    dxf.addLType("JPN_EIXO","Eixo: traço e ponto em mm de papel",[8,-2,1,-2]);
    dxf.addLType("JPN_TRACEJADO","Contraventamento: tracejado em mm de papel",[4,-2]);
    for(const [name,style] of Object.entries(CAD_LAYERS)){
      dxf.addLayer(name,style.color,style.type);
      const table=dxf.tables.layerTable,index=table.records.findIndex(r=>r.name===name),layer=new OfficeLayer(name,style.color,style.type,style.weight);
      layer.ownerObjectHandle=table.handle;table.records[index]=layer;
    }
    const style=dxf.tables.addStyle("JPN_TEXTO");style.fontFileName="Arial.ttf";style.fixedTextHeight=0;style.widthFactor=.85;
  }
  poly(space:DxfBlock,points:Point2[],layer="PERFIS"){
    return space.addLWPolyline(points.map(([x,y])=>({point:{x,y}})),{layerName:layer});
  }
  text(space:DxfBlock,at:Point2,value:string,layer="TEXTOS",height=2.5){
    const t=space.addText(point3d(...at),height,cleanCadText(value),{layerName:layer});t.textStyle="JPN_TEXTO";return t;
  }
  add(name:string,scale:number|null,draw:Page["draw"]){
    if(this.pages.some(p=>p.name===name))throw Error("Nome de folha duplicado: "+name);
    this.pages.push({name,scale,draw});
  }
  scale(width:number,height:number){
    const required=Math.max(width/(this.width-90),height/(this.height-172),1),power=10**Math.floor(Math.log10(required));
    return [1,2,2.5,5,10].map(v=>v*power).find(v=>v>=required)!;
  }
  dim(space:DxfBlock,a:Point2,b:Point2,scale:number,label:string,offset=7){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-9)return;
    const normal:Point2=[-(b[1]-a[1])/length*offset,(b[0]-a[0])/length*offset];
    const c:Point2=[a[0]+normal[0],a[1]+normal[1]],e:Point2=[b[0]+normal[0],b[1]+normal[1]];
    const block=this.dxf.addBlock(`COTA_${this.current}_${this.dxf.blocks.blocks.length}`);
    for(const [u,v] of [[a,c],[b,e],[c,e]] as [Point2,Point2][])this.poly(block,[u,v],"COTAS");
    for(const p of [c,e])this.poly(block,[[p[0]-1,p[1]-1],[p[0]+1,p[1]+1]],"COTAS");
    const middle:Point2=[(c[0]+e[0])/2,(c[1]+e[1])/2+1];
    const dimensionText=this.text(block,middle,`${label} ${cadNumber(length*scale)}`,"COTAS",2.5);
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
    if(angle>90||angle< -90)angle+=180;
    dimensionText.rotation=angle;dimensionText.horizontalAlignment=1;dimensionText.secondAlignmentPoint=point3d(...middle);
    const styleName=`JPN_MM_${scale}`;let style=this.dxf.tables.dimStyleTable.records.find(s=>s.name===styleName);
    if(!style){
      style=this.dxf.tables.dimStyleTable.addDimStyle(styleName);style.DIMLFAC=scale;style.DIMTXT=2.5;style.DIMASZ=1.5;style.DIMDEC=3;style.DIMDSEP=46;
      style.DIMTXSTY=this.dxf.tables.styleTable.records.find(s=>s.name==="JPN_TEXTO")!.handle;
      style.DIMCLRD=256;style.DIMCLRE=256;style.DIMCLRT=256;style.DIMLWD=13;style.DIMLWE=13;
    }
    space.addAlignedDim(point3d(...a),point3d(...b),{layerName:"COTAS",offset,definitionPoint:point3d(...e),middlePoint:point3d(...middle),
      blockName:block.name,styleName,ActualMeasurement:length,text:`${label} <>`});
  }
  /** Physical paper coordinates; row wrapping/pagination is planned before rendering. */
  table(prefix:string,headers:string[],rows:string[][],fractions:number[],layer="MATERIAIS",footer=""){
    const xs=fractions.map(f=>14+f*(this.width-29)),widths=xs.slice(1).map((x,i)=>Math.max(6,Math.floor((x-xs[i]-3)/1.15)));
    const wrap=(value:string,i:number)=>cleanCadText(value).match(new RegExp(`.{1,${widths[i]}}`,"gu"))??[""];
    let start=0,page=0;
    do{
      const planned:{cells:string[][];height:number}[]=[];let available=this.height-137;
      while(start<rows.length){
        const cells=rows[start].map(wrap),height=Math.max(...cells.map(c=>c.length))*3.6+2;
        if(height>this.height-137)throw Error("Texto excede uma folha: reduza o campo declarado ou use A1.");
        if(height>available)break;
        planned.push({cells,height});available-=height;start++;
      }
      this.add(`${prefix} ${++page}`,null,space=>{
        let y=this.height-50;headers.forEach((h,i)=>this.text(space,[xs[i]+1,y],h,layer,2.5));y-=6;
        for(const row of planned){
          this.poly(space,[[xs[0],y+3],[xs.at(-1)!,y+3]],layer);
          row.cells.forEach((lines,i)=>lines.forEach((line,j)=>this.text(space,[xs[i]+1,y-j*3.6],line,layer,2.3)));
          y-=row.height;
        }
        this.poly(space,[[xs[0],y+3],[xs.at(-1)!,y+3]],layer);
        xs.forEach(x=>this.poly(space,[[x,this.height-46],[x,y+3]],layer));
        if(footer)this.text(space,[16,78],footer,layer,2.3);
      });
    }while(start<rows.length);
  }
  notes(prefix:string,lines:string[]){
    const max=Math.floor((this.width-36)/1.45),wrapped=lines.flatMap(l=>cleanCadText(l).match(new RegExp(`.{1,${max}}`,"gu"))??[""]);
    const count=Math.floor((this.height-135)/5);
    for(let start=0,page=1;start<wrapped.length;start+=count,page++){
      const rows=wrapped.slice(start,start+count);
      this.add(`${prefix} ${page}`,null,space=>rows.forEach((line,i)=>this.text(space,[18,this.height-52-i*5],line)));
    }
  }
  render(){
    const original=[...this.pages],perIndex=Math.floor((this.height-135)/5);
    let count=1;while(Math.ceil((original.length+count)/perIndex)>count)count++;
    this.pages.length=0;
    for(let i=0;i<count;i++)this.add(`INDICE ${i+1}`,null,space=>{
      this.text(space,[18,this.height-48],"RELAÇÃO DE FOLHAS — conferir todos os PENDENTE", "TEXTOS",3);
      this.pages.slice(i*perIndex,(i+1)*perIndex).forEach((p,j)=>this.text(space,[18,this.height-57-j*5],`${i*perIndex+j+1} — ${p.name} — ${p.scale===null?"sem escala":"1:"+p.scale}`));
    });
    this.pages.push(...original);
    const objects=this.dxf.document.objects,dict=objects.addDictionary();objects.root.addEntryObject("ACAD_LAYOUT",dict.handle);
    const link=(space:DxfBlock,name:string,order:number)=>{
      const layout=objects.addObject(new SheetLayout(name,order,space.blockRecord.handle,dict.handle,this.width,this.height,this.format));
      space.blockRecord.layoutObject=layout.handle;dict.addEntryObject(name,layout.handle);
    };
    link(this.dxf.modelSpace,"Model",0);
    const date=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(this.issuedAt);
    for(const [i,page] of this.pages.entries()){
      this.current=i+1;
      const space=i===0?this.dxf.document.entities.paperSpace:this.dxf.addPaperSpace();link(space,page.name,i+1);
      this.poly(space,[[10,10],[this.width-10,10],[this.width-10,this.height-10],[10,this.height-10],[10,10]],"CARIMBO");
      this.text(space,[18,this.height-20],page.name,"TEXTOS",4.5);
      this.text(space,[18,this.height-29],`${this.format} · ${page.scale===null?"Sem escala":"Escala 1:"+page.scale} · cotas em mm · eixos das peças; sem descontos de fabricação`);
      this.poly(space,[[10,72],[this.width-10,72]],"CARIMBO");
      const nameLines=cleanCadText(this.job).match(/.{1,110}/gu)??[""];
      nameLines.slice(0,2).forEach((line,j)=>this.text(space,[16,64-j*4],line,"CARIMBO",3));
      this.text(space,[16,49],`Revisão: ${cleanCadText(this.revision).length>75?"ver NOTAS GERAIS":this.revision} · Data: ${date}`,"CARIMBO");
      this.text(space,[this.width-86,49],`Folha ${i+1} de ${this.pages.length}`,"CARIMBO");
      this.text(space,[16,38],"Responsável técnico: ____________________", "CARIMBO");
      this.text(space,[16,29],"CREA: ____________________    ART: ____________________", "CARIMBO");
      this.text(space,[16,19],CAD_NOTICE,"CARIMBO",3);
      page.draw(space);
    }
  }
}
