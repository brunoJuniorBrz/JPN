import {DxfObject,type Dxfier,type DxfBlock,type DxfWriter,point3d} from "@tarikjabiri/dxf";
import type {Project} from "@/domain/models";
import {declaredTakeoff} from "@/domain/declared-takeoff";

type V={x:number;y:number;z:number};
type P=[number,number];
const clean=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g," ");
const num=(n:number)=>Number(n.toFixed(3)).toString();
export const CAD_NOTICE="PRELIMINAR – NÃO UTILIZAR PARA EXECUÇÃO OU CORTE";

/** Native layout objects, linked in both directions to paper-space records.
 * Autodesk LAYOUT/BLOCK_RECORD group codes; no text substitution in DXF output.
 * https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm */
class SheetLayout extends DxfObject{
  constructor(readonly name:string,readonly order:number,readonly record:string,owner:string){super("LAYOUT");this.ownerObjecthandle=owner;}
  dxfy(dx:Dxfier){
    super.dxfy(dx);dx.push(100,"AcDbPlotSettings");dx.push(1,"");dx.push(4,"ISO_A3_(420.00_x_297.00_MM)");
    dx.push(40,10);dx.push(41,10);dx.push(42,10);dx.push(43,10);dx.push(44,420);dx.push(45,297);
    dx.push(70,0);dx.push(72,1);dx.push(73,0);dx.push(74,5);dx.push(142,1);dx.push(143,1);dx.push(147,1);
    dx.push(100,"AcDbLayout");dx.push(1,this.name);dx.push(70,1);dx.push(71,this.order);
    dx.point3d(point3d(0,0));dx.point2d({x:420,y:297},1);dx.point3d(point3d(0,0),2);dx.point3d(point3d(420,297),3);
    dx.point3d(point3d(0,0),4);dx.push(146,0);dx.point3d(point3d(1,0),6);dx.point3d(point3d(0,1),7);dx.push(76,0);dx.push(330,this.record);
  }
}

export function addPhysicalSheets(dxf:DxfWriter,project:Project,issuedAt:Date){
  const takeoff=declaredTakeoff(project),model=project.workspace.physicalStructure!,draft=project.workspace.spatialPreparation;
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const rows=new Map(takeoff.pieces.map(p=>[p.pieceId,p]));
  const profile=(id:string)=>{
    const row=rows.get(id)!;
    const sectionId=draft?.physicalCatalog?.assignments.find(a=>a.pieceId===id)?.sectionId;
    return draft?.physicalCatalog?.sections.find(s=>s.id===sectionId)?.designation?.trim()||`PENDENTE [${sectionId??row.sectionId??"sem seção"}]`;
  };
  for(const [layer,color] of Object.entries({COTAS:2,PERFIS:7,TEXTOS:7,CARIMBO:1,EIXOS:8,COBERTURA:4,APOIOS:3,MATERIAIS:7}))dxf.addLayer(layer,color);
  const objects=dxf.document.objects,dict=objects.addDictionary();objects.root.addEntryObject("ACAD_LAYOUT",dict.handle);
  const link=(space:DxfBlock,name:string,order:number)=>{
    const layout=objects.addObject(new SheetLayout(name,order,space.blockRecord.handle,dict.handle));
    space.blockRecord.layoutObject=layout.handle;dict.addEntryObject(name,layout.handle);
  };
  link(dxf.modelSpace,"Model",0);
  let index=0;
  const date=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(issuedAt);
  const poly=(space:DxfBlock,points:P[],layer:string)=>space.addLWPolyline(points.map(([x,y])=>({point:{x,y}})),{layerName:layer});
  const text=(space:DxfBlock,at:P,value:string,layer="TEXTOS",height=2.5)=>space.addText(point3d(...at),height,clean(value),{layerName:layer});
  const sheet=(name:string,scale:number)=>{
    const space=index===0?dxf.document.entities.paperSpace:dxf.addPaperSpace();link(space,name,++index);
    poly(space,[[10,10],[410,10],[410,287],[10,287],[10,10]],"CARIMBO");
    text(space,[18,277],name,"TEXTOS",4);
    text(space,[18,268],`Escala 1:${scale} · cotas em mm · eixos das peças, sem descontos de fabricação`);
    poly(space,[[10,54],[410,54]],"CARIMBO");
    const nameLines=clean(project.name).match(/.{1,95}/gu)??[""];
    nameLines.slice(0,3).forEach((line,i)=>text(space,[16,45-i*4],line,"CARIMBO",3));
    text(space,[16,28],`Revisão: ${model.revision} · Data: ${date} · Folha ${index}`,"CARIMBO");
    text(space,[16,19],CAD_NOTICE,"CARIMBO",3);
    return space;
  };
  const dim=(space:DxfBlock,a:P,b:P,scale:number,label:string,offset=7)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-9)return;
    const normal:P=[-(b[1]-a[1])/length*offset,(b[0]-a[0])/length*offset];
    const c:P=[a[0]+normal[0],a[1]+normal[1]],e:P=[b[0]+normal[0],b[1]+normal[1]];
    const block=dxf.addBlock(`COTA_${index}_${dxf.blocks.blocks.length}`);
    for(const [u,v] of [[a,c],[b,e],[c,e]] as [P,P][])poly(block,[u,v],"COTAS");
    for(const p of [c,e])poly(block,[[p[0]-1,p[1]-1],[p[0]+1,p[1]+1]],"COTAS");
    const middle:P=[(c[0]+e[0])/2,(c[1]+e[1])/2+1];
    text(block,middle,`${label} ${num(length*scale)}`,"COTAS",2.3);
    const styleName=`MM_${scale}`;let style=dxf.tables.dimStyleTable.records.find(s=>s.name===styleName);
    if(!style){style=dxf.tables.dimStyleTable.addDimStyle(styleName);style.DIMLFAC=scale;style.DIMTXT=2.3;style.DIMASZ=1.5;style.DIMDEC=3;}
    space.addAlignedDim(point3d(...a),point3d(...b),{layerName:"COTAS",offset,definitionPoint:point3d(...e),middlePoint:point3d(...middle),
      blockName:block.name,styleName,ActualMeasurement:length,text:`${label} <>`});
  };
  const supportNodes=(draft?.supports??[]).filter(s=>s.dofs.some(d=>d==="fixed")).flatMap(s=>nodes.has(s.nodeId)?[nodes.get(s.nodeId)!]:[]);
  const datum=supportNodes.length?Math.min(...supportNodes.map(n=>n.z)):Math.min(...model.nodes.map(n=>n.z));
  const sectionY=Math.min(...(supportNodes.length?supportNodes:model.nodes).map(n=>n.y));
  const faces=draft?.physicalRoofFaces?.faces??[];
  const roof=faces.flatMap(f=>f.outer.map(([x,y,z])=>({x,y,z})));
  // A ridge is supported only by a common elevated edge of two physical faces.
  const ridge=faces.flatMap((f,i)=>faces.slice(i+1).flatMap(g=>{
    const common=f.outer.filter(p=>g.outer.some(q=>q.every((v,k)=>v===p[k])));
    const unique=[...new Map(common.map(p=>[p.join(","),p])).values()];
    if(unique.length!==2||unique[0][2]!==unique[1][2])return [];
    const h=unique[0][2];return [f,g].every(face=>face.outer.some(p=>p[2]<h)&&face.outer.every(p=>p[2]<=h))?[h]:[];
  }));
  const projectPoint=(view:string,n:V):P=>view==="PLANTA"?[n.x,n.y]:view==="LATERAL"?[n.y,n.z]:[n.x,n.z];
  const unique=(v:number[])=>[...new Set(v)].sort((a,b)=>a-b);
  for(const view of ["PLANTA","FRONTAL","LATERAL","CORTE A-A"]){
    const points=[...model.nodes,...roof],coords=points.map(n=>projectPoint(view,n));
    if(view!=="PLANTA")coords.push([coords[0][0],datum]);
    const minX=Math.min(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1]));
    const width=Math.max(...coords.map(p=>p[0]))-minX,height=Math.max(...coords.map(p=>p[1]))-minY;
    const required=Math.max(width/330,height/145,1),power=10**Math.floor(Math.log10(required));
    const scale=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=required)!;
    const space=sheet(view,scale),at=(p:P):P=>[40+(p[0]-minX)/scale,90+(p[1]-minY)/scale];
    text(space,[18,260],view==="CORTE A-A"?`Interseção real em Y=${num(sectionY)} mm; símbolos representam eixos, não seções dimensionadas.`:`Projeção ortogonal de barras/superfícies declaradas; referência de altura Z=${num(datum)} mm.`);
    // Bars at different depths can share a projection. Keep their labels distinct.
    const occupied:{x:number;y:number;width:number;height:number}[]=[];
    const pieceLabel=(anchor:P,value:string)=>{
      const lines=clean(value).match(/.{1,70}/gu)??[""],width=Math.max(...lines.map(l=>l.length))*1.2,height=lines.length*2.8;
      const x=Math.max(18,Math.min(400-width,anchor[0]+1));let y=anchor[1]+1;
      for(let i=0;i<100;i++){
        const candidate=Math.max(82+height,Math.min(250,anchor[1]+1+(i%2?-1:1)*Math.ceil(i/2)*3));
        y=candidate;
        if(!occupied.some(b=>x<b.x+b.width+1&&x+width+1>b.x&&y-height<b.y+1&&y+1>b.y-b.height))break;
      }
      occupied.push({x,y,width,height});
      if(Math.hypot(x-anchor[0],y-anchor[1])>4)poly(space,[anchor,[x,y]],"PERFIS");
      lines.forEach((line,i)=>text(space,[x,y-i*2.8],line,"PERFIS",1.8));
    };
    for(const p of model.pieces){
      const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
      if(view==="CORTE A-A"&&!(a.y===sectionY&&b.y===sectionY)){
        if(a.y!==b.y&&sectionY>=Math.min(a.y,b.y)&&sectionY<=Math.max(a.y,b.y)){
          const t=(sectionY-a.y)/(b.y-a.y),q=at([a.x+t*(b.x-a.x),a.z+t*(b.z-a.z)]);
          space.addCircle(point3d(...q),.7,{layerName:"PERFIS"});pieceLabel(q,`${p.id}: ${profile(p.id)}`);
        }continue;
      }
      const u=at(projectPoint(view,a)),v=at(projectPoint(view,b));poly(space,[u,v],"PERFIS");
      pieceLabel([(u[0]+v[0])/2,(u[1]+v[1])/2],`${p.id}: ${profile(p.id)}`);
    }
    for(const face of faces){
      if(view==="CORTE A-A"){
        const intersections:P[]=[];
        for(const ring of [face.outer,...face.holes])for(let i=1;i<ring.length;i++){
          const a=ring[i-1],b=ring[i];
          if(a[1]===sectionY&&b[1]===sectionY)poly(space,[at([a[0],a[2]]),at([b[0],b[2]])],"COBERTURA");
          else if((a[1]<=sectionY&&b[1]>sectionY)||(b[1]<=sectionY&&a[1]>sectionY)){
            const t=(sectionY-a[1])/(b[1]-a[1]);intersections.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);
          }
        }
        intersections.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        for(let i=1;i<intersections.length;i+=2)poly(space,[at(intersections[i-1]),at(intersections[i])],"COBERTURA");
      }else for(const ring of [face.outer,...face.holes])poly(space,ring.map(([x,y,z])=>at(projectPoint(view,{x,y,z}))),"COBERTURA");
    }
    for(const n of supportNodes){const q=at(projectPoint(view,n));if(view==="CORTE A-A"&&n.y!==sectionY)continue;poly(space,[[q[0],q[1]],[q[0]-1.5,q[1]-2],[q[0]+1.5,q[1]-2],[q[0],q[1]]],"APOIOS");text(space,[q[0]+2,q[1]-3],`APOIO ${n.id}`,"APOIOS",2);}
    if(width>0)dim(space,at([minX,minY]),at([minX+width,minY]),scale,"EXTENSÃO",-15);
    const positions=unique(supportNodes.map(n=>view==="LATERAL"?n.y:n.x));
    for(let i=1;i<positions.length;i++)dim(space,at([positions[i-1],minY]),at([positions[i],minY]),scale,"VÃO",-7);
    if(view==="PLANTA"){
      const ys=unique(supportNodes.map(n=>n.y));for(let i=1;i<ys.length;i++)dim(space,at([minX,ys[i-1]]),at([minX,ys[i]]),scale,"VÃO Y",8);
      poly(space,[at([minX,sectionY]),at([minX+width,sectionY])],"EIXOS");text(space,at([minX,sectionY]),"A-A","EIXOS");
    }else{
      const levels=unique(roof.map(n=>n.z));
      for(const z of unique([...levels,...ridge]))dim(space,at([minX,datum]),at([minX,z]),scale,ridge.includes(z)?"CUMEEIRA":"BORDA/BEIRAL",ridge.includes(z)?20:10);
      if(!roof.length)text(space,[18,65],"PENDENTE: cobertura física não declarada; alturas de beiral/cumeeira não inferidas.");
      else if(!ridge.length)text(space,[18,65],"Cumeeira não identificada em aresta comum de águas; cotas Z superiores não são presumidas como cumeeira.");
    }
    if(view==="CORTE A-A"){
      const crossings=model.pieces.filter(p=>p.role==="purlin").flatMap(p=>{
        const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
        if(a.y===b.y||sectionY<Math.min(a.y,b.y)||sectionY>Math.max(a.y,b.y))return [];
        const t=(sectionY-a.y)/(b.y-a.y);return [[a.x+t*(b.x-a.x),a.z+t*(b.z-a.z)] as P];
      }).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const distinct=crossings.filter((p,i)=>!i||p.some((v,k)=>v!==crossings[i-1][k]));
      for(let i=1;i<distinct.length;i++)dim(space,at(distinct[i-1]),at(distinct[i]),scale,"EIXOS TERÇAS",5);
      if(distinct.length<2)text(space,[18,71],"PENDENTE: sequência de eixos de terças não identificada neste corte.");
    }
    if(!supportNodes.length)text(space,[18,77],"PENDENTE: apoios não declarados; não foram criados apoios ou vãos fictícios.");
  }
  // One row per actual physical piece: quantity 1, geometric length, existing mass.
  const columns=[14,50,178,197,254,319,405],headers=["PEÇA","PERFIL DECLARADO","QTD","COMP. (mm)","PESO (kg/m)","PESO (kg)"];
  let materialPage=0;
  for(let start=0;start<takeoff.pieces.length;){
    const space=sheet(`MATERIAIS ${++materialPage}`,1);let y=248;
    headers.forEach((h,i)=>text(space,[columns[i]+1,y],h,"MATERIAIS",2.3));y-=5;
    let count=0;
    while(start<takeoff.pieces.length&&count<20){
      const p=takeoff.pieces[start++],cells=[p.pieceId,profile(p.pieceId),"1",num(p.lengthMm),p.massKg===null?"PENDENTE":num(p.massKg/(p.lengthMm/1000)),p.massKg===null?"PENDENTE":num(p.massKg)];
      const wraps=cells.map((v,i)=>clean(v).match(new RegExp(`.{1,${i===1?65:i===0?17:22}}`,"gu"))??[""]);
      const rowHeight=Math.max(...wraps.map(v=>v.length))*3.4+2;
      if(y-rowHeight<68){start--;break;}
      wraps.forEach((lines,i)=>lines.forEach((line,j)=>text(space,[columns[i]+1,y-j*3.4],line,"MATERIAIS",2.1)));
      poly(space,[[14,y+3],[405,y+3]],"MATERIAIS");y-=rowHeight;count++;
    }
    columns.forEach(x=>poly(space,[[x,252],[x,y]],"MATERIAIS"));
    text(space,[16,60],`TOTAL: ${takeoff.totals.quantity} peças · ${num(takeoff.totals.lengthM*1000)} mm · ${takeoff.totals.massKg===null?"PESO PENDENTE":num(takeoff.totals.massKg)+" kg"}`,"MATERIAIS");
  }
}
