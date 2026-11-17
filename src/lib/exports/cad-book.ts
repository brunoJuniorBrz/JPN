import {DxfObject,DxfLayer,Line,type Dxfier,type DxfBlock,type DxfWriter,point3d} from "@tarikjabiri/dxf";

export type PaperFormat="A3"|"A1";
export type Point2=[number,number];
export type CadRect={x:number;y:number;width:number;height:number};
export const CAD_NOTICE="PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE";
export const cleanCadText=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g," ");
export const cadNumber=(n:number)=>Number(n.toFixed(3)).toString();
export const CAD_LAYERS={
  COTAS:{color:2,type:"Continuous",weight:25},PERFIS:{color:7,type:"Continuous",weight:50},
  TEXTOS:{color:7,type:"Continuous",weight:25},CARIMBO:{color:7,type:"Continuous",weight:50},
  EIXOS:{color:8,type:"JPN_EIXO",weight:18},COBERTURA:{color:4,type:"Continuous",weight:25},
  APOIOS:{color:3,type:"Continuous",weight:50},MATERIAIS:{color:7,type:"Continuous",weight:25},
  CONTRAVENTOS:{color:6,type:"JPN_TRACEJADO",weight:50},BARRAS_AUXILIARES:{color:8,type:"Continuous",weight:50},
  REACOES:{color:1,type:"Continuous",weight:25},MARCAS:{color:7,type:"Continuous",weight:25},
  PENDENCIAS:{color:1,type:"Continuous",weight:35},VISTAS:{color:7,type:"Continuous",weight:18},
  column:{color:30,type:"Continuous",weight:50},beam:{color:7,type:"Continuous",weight:50},
  topChord:{color:3,type:"Continuous",weight:50},bottomChord:{color:3,type:"Continuous",weight:50},
  web:{color:8,type:"Continuous",weight:50},purlin:{color:4,type:"Continuous",weight:50},
  IDENTIFICACAO:{color:7,type:"Continuous",weight:25},PRELIMINAR:{color:1,type:"Continuous",weight:35},
} as const;

class OfficeLayer extends DxfLayer{
  constructor(name:string,color:number,lineType:string,readonly weight:number){super(name,color,lineType);}
  dxfy(dx:Dxfier){super.dxfy(dx);dx.push(370,this.weight);}
}
class SheetLayout extends DxfObject{
  constructor(readonly name:string,readonly order:number,readonly record:string,owner:string,readonly width:number,readonly height:number,readonly format:PaperFormat){super("LAYOUT");this.ownerObjecthandle=owner;}
  dxfy(dx:Dxfier){
    super.dxfy(dx);dx.push(100,"AcDbPlotSettings");dx.push(1,"");dx.push(4,`ISO_${this.format}_(${this.width}.00_x_${this.height}.00_MM)`);
    dx.push(40,0);dx.push(41,0);dx.push(42,0);dx.push(43,0);dx.push(44,this.width);dx.push(45,this.height);
    dx.push(70,128);dx.push(72,1);dx.push(73,0);dx.push(74,5);dx.push(142,1);dx.push(143,1);dx.push(147,1);
    dx.push(100,"AcDbLayout");dx.push(1,this.name);dx.push(70,1);dx.push(71,this.order);
    dx.point2d({x:0,y:0});dx.point2d({x:this.width,y:this.height},1);dx.point3d(point3d(0,0),2);dx.point3d(point3d(0,0),3);
    dx.point3d(point3d(0,0),4);dx.point3d(point3d(this.width,this.height),5);dx.push(146,0);dx.point3d(point3d(1,0),6);dx.point3d(point3d(0,1),7);dx.push(76,0);dx.push(330,this.record);
  }
}
/** Entity is private in the DXF library. Reuse the common serializer from Line,
 * replacing its type, subclass and entire payload with a native locked viewport. */
class SheetViewport extends Line{
  constructor(readonly rect:CadRect,readonly center:Point2,readonly scale:number,readonly id:number){
    super(point3d(rect.x,rect.y),point3d(rect.x+rect.width,rect.y+rect.height),{layerName:"VISTAS"});
    this.type="VIEWPORT";this.subclassMarker="AcDbViewport";
  }
  protected dxfyChild(dx:Dxfier){
    dx.point3d(point3d(this.rect.x+this.rect.width/2,this.rect.y+this.rect.height/2));
    dx.push(40,this.rect.width);dx.push(41,this.rect.height);dx.push(68,this.id);dx.push(69,this.id);
    dx.point2d({x:this.center[0],y:this.center[1]},2);dx.point2d({x:0,y:0},3);
    dx.point2d({x:1,y:1},4);dx.point2d({x:1,y:1},5);dx.point3d(point3d(0,0,1),6);dx.point3d(point3d(0,0),7);
    dx.push(42,50);dx.push(43,0);dx.push(44,0);dx.push(45,this.rect.height*this.scale);
    dx.push(50,0);dx.push(51,0);dx.push(72,100);dx.push(90,16384);dx.push(281,0);dx.push(71,0);dx.push(74,0);
  }
}

export type CadPage={name:string;title:string;draw:((space:DxfBlock)=>void)[]};
export class CadBook{
  readonly width:number;readonly height:number;readonly pages:CadPage[]=[];
  private viewCount=0;private cacheX:number;
  private dimensionLines=new WeakMap<DxfBlock,[Point2,Point2][]>();
  constructor(readonly dxf:DxfWriter,readonly format:PaperFormat,readonly job:string,readonly revision:string,readonly issuedAt:Date,modelMaxX=0){
    if(format!=="A3"&&format!=="A1")throw Error("Formato CAD não suportado; use A3 ou A1.");
    [this.width,this.height]=format==="A1"?[841,594]:[420,297];this.cacheX=Math.max(0,modelMaxX)+1_000_000;
    dxf.addLType("JPN_EIXO","Eixo: traço e ponto em mm de papel",[4,-1,.5,-1]);
    dxf.addLType("JPN_TRACEJADO","Contraventamento: tracejado em mm de papel",[4,-2]);
    for(const [name,style] of Object.entries(CAD_LAYERS)){
      dxf.addLayer(name,style.color,style.type);
      const table=dxf.tables.layerTable,index=table.records.findIndex(r=>r.name===name),layer=new OfficeLayer(name,style.color,style.type,style.weight);
      layer.ownerObjectHandle=table.handle;table.records[index]=layer;
    }
    const style=dxf.tables.addStyle("JPN_TEXTO");style.fontFileName="Arial.ttf";style.fixedTextHeight=0;style.widthFactor=.85;
    dxf.tables.addAppId("JPN_COTA");
    dxf.setVariable("$PSLTSCALE",{70:1});dxf.setVariable("$LTSCALE",{40:1});dxf.setVariable("$LWDISPLAY",{290:1});
  }
  get area():CadRect{return {x:30,y:86,width:this.width-45,height:this.height-123};}
  poly(space:DxfBlock,points:Point2[],layer="PERFIS"){
    return space.addLWPolyline(points.map(([x,y])=>({point:{x,y}})),{layerName:layer});
  }
  text(space:DxfBlock,at:Point2,value:string,layer="TEXTOS",height=2.5){
    const t=space.addText(point3d(...at),height,cleanCadText(value),{layerName:layer});t.textStyle="JPN_TEXTO";return t;
  }
  box(space:DxfBlock,r:CadRect,layer="TEXTOS"){
    this.poly(space,[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height],[r.x,r.y]],layer);
  }
  add(name:string,title:string):CadPage{
    let unique=name,n=2;while(this.pages.some(p=>p.name===unique))unique=`${name} ${n++}`;
    const page={name:unique,title,draw:[]};this.pages.push(page);return page;
  }
  /** Nearest standard scale to 70% occupancy; larger standards avoid clipping. */
  scale(width:number,height:number,available:CadRect){
    const required=Math.max(width/available.width,height/available.height),scales=[20,25,50,75,100,200,250,500,750,1000,2000,2500,5000,10000];
    while(scales.at(-1)!<required)scales.push(scales.at(-1)!*2);
    return scales.filter(s=>s>=required).sort((a,b)=>Math.abs(required/a-.7)-Math.abs(required/b-.7))[0];
  }
  view(page:CadPage,rect:CadRect,title:string,scale:number,draw:(space:DxfBlock)=>void){
    const block=this.dxf.addBlock(`JPN_VISTA_${++this.viewCount}`);draw(block);
    const offset=this.cacheX;this.cacheX+=(rect.width+100)*scale;
    this.dxf.modelSpace.addInsert(block.name,point3d(offset,0),{layerName:"VISTAS",scaleFactor:{x:scale,y:scale,z:scale}});
    const id=page.draw.length+2;
    page.draw.push(space=>{
      this.text(space,[rect.x,rect.y+rect.height+1],`${title} · 1:${scale}`,"TEXTOS",3.2);
      space.addEntity(new SheetViewport(rect,[offset+rect.width/2*scale,rect.height/2*scale],scale,id));
    });
  }
  graphicScale(space:DxfBlock,at:Point2,scale:number){
    for(let i=0;i<=4;i++){
      if(i<4)this.poly(space,[[at[0]+i*10,at[1]],[at[0]+(i+1)*10,at[1]]],"COTAS");
      this.poly(space,[[at[0]+i*10,at[1]-1],[at[0]+i*10,at[1]+1]],"COTAS");
      this.text(space,[at[0]+i*10-1,at[1]+2],`${cadNumber(scale*10*i)}${i===4?" mm":""}`,"COTAS",1.8);
    }
  }
  dimensionObstacles(space:DxfBlock){return this.dimensionLines.get(space)??[];}
  dim(space:DxfBlock,a:Point2,b:Point2,scale:number,label:string,offset=7){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-9)return;
    const normal:Point2=[-(b[1]-a[1])/length*offset,(b[0]-a[0])/length*offset];
    const c:Point2=[a[0]+normal[0],a[1]+normal[1]],e:Point2=[b[0]+normal[0],b[1]+normal[1]];
    const lines=this.dimensionLines.get(space)??[];lines.push([a,c],[b,e],[c,e]);this.dimensionLines.set(space,lines);
    const block=this.dxf.addBlock(`COTA_${this.dxf.blocks.blocks.length}`);
    for(const [u,v] of [[a,c],[b,e],[c,e]] as [Point2,Point2][])this.poly(block,[u,v],"COTAS");
    for(const p of [c,e])this.poly(block,[[p[0]-1,p[1]-1],[p[0]+1,p[1]+1]],"COTAS");
    const middle:Point2=[(c[0]+e[0])/2,(c[1]+e[1])/2+1],dimensionText=this.text(block,middle,cadNumber(length*scale),"COTAS",2.5);
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;if(angle>90||angle< -90)angle+=180;
    dimensionText.rotation=angle;dimensionText.horizontalAlignment=1;dimensionText.secondAlignmentPoint=point3d(...middle);
    const styleName=`JPN_MM_${scale}`;let style=this.dxf.tables.dimStyleTable.records.find(s=>s.name===styleName);
    if(!style){
      style=this.dxf.tables.dimStyleTable.addDimStyle(styleName);style.DIMLFAC=scale;style.DIMTXT=2.5;style.DIMASZ=1.5;style.DIMDEC=3;style.DIMDSEP=46;
      style.DIMTXSTY=this.dxf.tables.styleTable.records.find(s=>s.name==="JPN_TEXTO")!.handle;
      style.DIMCLRD=256;style.DIMCLRE=256;style.DIMCLRT=256;style.DIMLWD=25;style.DIMLWE=25;
    }
    const dimension=space.addAlignedDim(point3d(...a),point3d(...b),{layerName:"COTAS",definitionPoint:point3d(...e),middlePoint:point3d(...middle),
      blockName:block.name,styleName,ActualMeasurement:length,text:"<>"});
    // This library version drops the final character in ExtendedData.string().
    // A disposable trailing space preserves the complete label (reader-tested).
    dimension.addXData("JPN_COTA").string(label+" ");
  }
  /** Tables share a page until the reserved rectangle is full; never drop rows. */
  table(page:CadPage,rect:CadRect,title:string,headers:string[],rows:string[][],fractions:number[],layer="MATERIAIS",footer=""){
    let start=0,target=page,area=rect,firstBottom:number|null=null;
    do{
      const xs=fractions.map(f=>area.x+f*area.width);
      const wrap=(value:string,i:number)=>this.wrap(value,Math.max(6,xs[i+1]-xs[i]-3),2.1);
      const planned:{cells:string[][];height:number}[]=[];let available=area.height-18;
      while(start<rows.length){
        const cells=rows[start].map(wrap),height=Math.max(...cells.map(c=>c.length))*3.4+2;if(height>available)break;
        planned.push({cells,height});available-=height;start++;
      }
      if(!planned.length&&start<rows.length){
        if(area.height===this.area.height&&area.width===this.area.width)throw Error("Texto excede uma folha: reduza o campo declarado ou use A1.");
      }else{
        firstBottom??=area.y+area.height-13-planned.reduce((sum,r)=>sum+r.height,0);
        const bounds={...area};target.draw.push(space=>{
          this.text(space,[bounds.x,bounds.y+bounds.height-3],title,layer,3);
          let y=bounds.y+bounds.height-10;headers.forEach((h,i)=>this.text(space,[xs[i]+1,y],h,layer,2.2));y-=6;
          for(const row of planned){
            this.poly(space,[[xs[0],y+3],[xs.at(-1)!,y+3]],layer);
            row.cells.forEach((lines,i)=>lines.forEach((line,j)=>this.text(space,[xs[i]+1,y-j*3.4],line,layer,2.1)));y-=row.height;
          }
          this.poly(space,[[xs[0],y+3],[xs.at(-1)!,y+3]],layer);
          xs.forEach(x=>this.poly(space,[[x,bounds.y+bounds.height-6],[x,y+3]],layer));
          if(footer)this.wrapped(space,{...bounds,y:bounds.y-3,height:8},footer,2,3.2,layer);
        });
      }
      if(start<rows.length){target=this.add(page.name,`${page.title} — continuação`);area=this.area;}
    }while(start<rows.length);
    return firstBottom??rect.y;
  }
  wrap(value:string,width:number,height:number){
    const max=Math.max(1,Math.floor(width/(height*.8))),lines:string[]=[];let line="";
    for(let word of cleanCadText(value).split(/\s+/)){
      if(line&&line.length+word.length+1>max){lines.push(line);line="";}
      while(word.length>max){if(line){lines.push(line);line="";}lines.push(word.slice(0,max));word=word.slice(max);}
      if(word)line+=(line?" ":"")+word;
    }
    if(line)lines.push(line);return lines;
  }
  wrapped(space:DxfBlock,area:CadRect,value:string,height=2.5,leading=4,layer="TEXTOS"){
    const lines=this.wrap(value,area.width,height);
    lines.forEach((l,i)=>this.text(space,[area.x,area.y+area.height-height-i*leading],l,layer,height));return lines.length*leading;
  }
  notes(page:CadPage,rect:CadRect,lines:string[],trace=""){
    const traceLines=this.wrap(`Rastreabilidade: ${trace}`,rect.width,1.4),maxTrace=Math.floor(28/2);
    // Trace continuations use separate pages if needed; no metadata is truncated.
    const tracePages=Math.max(1,Math.ceil(traceLines.length/maxTrace)),reserve=Math.min(28,traceLines.length*2+3);
    let target=page,y=rect.y+rect.height;
    for(const [i,line] of lines.entries()){
      const wrapped=this.wrap(`${i+1}. ${line}`,rect.width,2.5);let offset=0;
      while(offset<wrapped.length){
        const capacity=Math.floor((y-rect.y-reserve)/4.2);
        if(capacity<1){target=this.add(page.name,`${page.title} — continuação`);y=rect.y+rect.height;continue;}
        const rows=wrapped.slice(offset,offset+capacity),top=y;
        target.draw.push(space=>rows.forEach((l,j)=>this.text(space,[rect.x,top-2.5-j*4.2],l,line.includes("PENDENTE")?"PENDENCIAS":"TEXTOS",2.5)));
        offset+=rows.length;y-=rows.length*4.2;
      }
      y-=2;
    }
    for(let i=0;i<tracePages;i++){
      if(i)target=this.add("RASTREABILIDADE","Notas gerais — rastreabilidade");
      const rows=traceLines.slice(i*maxTrace,(i+1)*maxTrace);
      target.draw.push(space=>{
        this.poly(space,[[rect.x,rect.y+reserve],[rect.x+rect.width,rect.y+reserve]],"TEXTOS");
        rows.forEach((line,j)=>this.text(space,[rect.x,rect.y+reserve-3-j*2],line,"TEXTOS",1.4));
      });
    }
  }
  render(){
    const objects=this.dxf.document.objects,dict=objects.addDictionary();objects.root.addEntryObject("ACAD_LAYOUT",dict.handle);
    const link=(space:DxfBlock,name:string,order:number)=>{
      const layout=objects.addObject(new SheetLayout(name,order,space.blockRecord.handle,dict.handle,this.width,this.height,this.format));
      space.blockRecord.layoutObject=layout.handle;dict.addEntryObject(name,layout.handle);
    };link(this.dxf.modelSpace,"Model",0);
    const date=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(this.issuedAt);
    for(const [i,page] of this.pages.entries()){
      const space=i===0?this.dxf.document.entities.paperSpace:this.dxf.addPaperSpace();link(space,page.name,i+1);
      // The first viewport is the native paper view, not a model-detail viewport.
      space.addEntity(new SheetViewport({x:0,y:0,width:this.width,height:this.height},[this.width/2,this.height/2],1,1));
      this.box(space,{x:25,y:10,width:this.width-35,height:this.height-20},"CARIMBO");
      this.text(space,[30,this.height-21],page.title,"TEXTOS",4.5);
      this.text(space,[30,this.height-28],`${this.format} · cotas em mm · escalas indicadas nas vistas · comprimentos entre nós`,"TEXTOS",2.3);
      const x=this.width-190;this.box(space,{x,y:23,width:180,height:55},"CARIMBO");
      for(const y of [34,44,54,66])this.poly(space,[[x,y],[this.width-10,y]],"CARIMBO");
      this.wrapped(space,{x:x+2,y:66,width:176,height:10},this.job,this.job.length>120?2.3:3,this.job.length>120?2.8:3.6,"CARIMBO");
      this.text(space,[x+2,58],`Revisão: ${this.revision.length>24?"ver notas":this.revision}`,"CARIMBO",2.2);
      this.text(space,[x+65,58],`Data: ${date}`,"CARIMBO",2.2);this.text(space,[x+126,58],`Folha ${i+1} de ${this.pages.length}`,"CARIMBO",2.2);
      for(const dx of [62,123])this.poly(space,[[x+dx,54],[x+dx,66]],"CARIMBO");
      this.text(space,[x+2,48],"Responsável técnico: ____________________","CARIMBO",2.5);
      this.text(space,[x+2,38],"CREA: ____________________    ART: ____________________","CARIMBO",2.5);
      this.text(space,[x+2,27],"Emissão preliminar para conferência profissional","CARIMBO",2.3);
      const rev={x:30,y:23,width:Math.min(170,x-35),height:36};this.box(space,rev,"CARIMBO");
      this.text(space,[rev.x+2,rev.y+30],"Quadro de revisões","CARIMBO",2.5);
      for(const y of [rev.y+24,rev.y+16,rev.y+8])this.poly(space,[[rev.x,y],[rev.x+rev.width,y]],"CARIMBO");
      for(const dx of [30,60])this.poly(space,[[rev.x+dx,rev.y],[rev.x+dx,rev.y+24]],"CARIMBO");
      this.text(space,[rev.x+2,rev.y+19],"Revisão","CARIMBO",2);this.text(space,[rev.x+32,rev.y+19],"Data","CARIMBO",2);this.text(space,[rev.x+62,rev.y+19],"Descrição","CARIMBO",2);
      this.text(space,[rev.x+2,rev.y+11],this.revision.length>15?"Ver notas":this.revision,"CARIMBO",2);
      this.text(space,[rev.x+32,rev.y+11],date,"CARIMBO",2);this.text(space,[rev.x+62,rev.y+11],"Para conferência","CARIMBO",2);
      this.text(space,[30,15],CAD_NOTICE,"CARIMBO",3);page.draw.forEach(draw=>draw(space));
    }
  }
}
