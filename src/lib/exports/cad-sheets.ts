import {type DxfWriter,point3d} from "@tarikjabiri/dxf";
import type {Project} from "@/domain/models";
import {CadBook,CAD_NOTICE,type PaperFormat,type Point2 as P,type CadRect,type CadPage} from "./cad-book";
import {cadModel,cadReactions,axisLetter,sortedCoordinates as unique,isDeclaredBrace,type CadPiece,type CadReactionReceipt} from "./cad-model";
import {cadRoofFaces} from "./cad-roof";
import {lineTypeId,trussSummary,typeName} from "@/domain/truss-editor";
import {isUnlocatedCommercialPiece} from "./package-commercial-groups";
import {reviewSourceDimensions,reviewRoofSlope,reviewRoofEnvelope} from "./package-dimension-review";
export {CAD_NOTICE};
export type CadExportOptions={format?:PaperFormat;reactions?:CadReactionReceipt};
/** Somente textos das pranchas: comprimentos/cotas inteiros e massas com 1 casa.
 * As coordenadas físicas continuam numéricas sem arredondamento de geometria. */
const num=(n:number)=>String(Math.round(n));
const mass1=(n:number)=>n.toFixed(1);
const reaction3=(n:number)=>Number(n.toFixed(3)).toString();

export function addPhysicalSheets(dxf:DxfWriter,project:Project,issuedAt:Date,options:CadExportOptions={}){
  const data=cadModel(project),{model,draft,takeoff,nodes,profile,supports,xs,ys}=data;
  const book=new CadBook(dxf,options.format??"A3",project.name,model.revision,issuedAt,Math.max(...model.nodes.map(n=>n.x)));
  const trussAccounting=project.workspace.trussEditor?trussSummary(project.workspace.trussEditor):null;
  const counters=new Map<string,number>(),marks=new Map<string,string>(),markByType=new Map<string,string>(),markCounts=new Map<string,number>();
  const items=new Map(takeoff.pieces.map(p=>[p.pieceId,p]));
  const unlocated=new Set(takeoff.pieces.filter(isUnlocatedCommercialPiece).map(p=>p.pieceId));
  const sourceDimensions=reviewSourceDimensions(project),dimensionByPiece=new Map(sourceDimensions.map(r=>[r.pieceId,r]));
  const roofSlopeReviews=reviewRoofSlope(project),overallDimensionReviews=reviewRoofEnvelope(project);
  for(const p of [...model.pieces].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))){
    const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
    const verticalWeb=p.role==="web"&&!isDeclaredBrace(p)&&Math.hypot(a.x-b.x,a.y-b.y)<=1;
    const prefix=isDeclaredBrace(p)?"D":p.role==="web"?(verticalWeb?"M":"D"):({column:"C",beam:"V",purlin:"T",topChord:"BS",bottomChord:"BI"} as const)[p.role];
    const piece=items.get(p.id),assignment=draft?.physicalCatalog?.assignments.find(a=>a.pieceId===p.id);
    const ends=draft?.memberConnections.find(c=>c.pieceId===p.id);
    const fabrication=project.workspace.fabrication.find(f=>f.pieceId===p.id);
    const key=JSON.stringify([prefix,p.role,assignment?.sectionId??piece?.sectionId,assignment?.materialId??piece?.materialId,
      piece?.steelGrade,piece?.lengthMm,assignment?.rotationDeg,ends?.start,ends?.end,
      fabrication?.signature,fabrication?.lengthMm,unlocated.has(p.id)]);
    const mark=markByType.get(key)??`${prefix}${(counters.get(prefix)??0)+1}`;
    if(!markByType.has(key)){markByType.set(key,mark);counters.set(prefix,(counters.get(prefix)??0)+1);}
    marks.set(p.id,mark);markCounts.set(mark,(markCounts.get(mark)??0)+1);
  }
  const supportMarks=new Map(supports.map((n,i)=>[n.id,`AP${i+1}`]));
  const trace:string[]=[`Obra=${project.id}; revisão=${model.revision}; origem=${model.provenance}`,
    ...model.pieces.map(p=>`${marks.get(p.id)}=${p.id}`),...supports.map(n=>`${supportMarks.get(n.id)}=${n.id}`)];
  const datum=Math.min(...(supports.length?supports:model.nodes).map(n=>n.z));
  const faces=cadRoofFaces(project),roof=faces.flatMap(f=>f.outer.map(([x,y,z])=>({x,y,z})));
  const ridge=faces.flatMap((f,i)=>faces.slice(i+1).flatMap(g=>{
    const common=f.outer.filter(p=>g.outer.some(q=>q.every((v,k)=>v===p[k])));
    const edge=[...new Map(common.map(p=>[p.join(","),p])).values()];
    if(edge.length!==2||edge[0][2]!==edge[1][2])return [];
    const h=edge[0][2];return [f,g].every(face=>face.outer.some(p=>p[2]<h)&&face.outer.every(p=>p[2]<=h))?[h]:[];
  }));
  const purlins=model.pieces.filter(p=>p.role==="purlin"&&!unlocated.has(p.id));
  const yDirection=purlins.reduce((s,p)=>s+Math.abs(nodes.get(p.end)!.y-nodes.get(p.start)!.y),0);
  const xDirection=purlins.reduce((s,p)=>s+Math.abs(nodes.get(p.end)!.x-nodes.get(p.start)!.x),0);
  const cutAxis=yDirection>=xDirection?"y":"x",across=cutAxis==="y"?"x":"y";
  // A cut at an arbitrary unlocated/stock point previously missed every
  // purlin. Choose the actual purlin interval with most intersections.
  const intervals=purlins.map(p=>{
    const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
    return [Math.min(a[cutAxis],b[cutAxis]),Math.max(a[cutAxis],b[cutAxis])] as const;
  });
  const candidateCuts=intervals.flatMap(([a,b])=>[a,(a+b)/2,b]).filter(Number.isFinite);
  const sectionPosition=candidateCuts.length?candidateCuts.sort((a,b)=>{
    const hits=(x:number)=>intervals.filter(([lo,hi])=>lo<=x&&x<=hi&&hi-lo>1).length;
    return hits(b)-hits(a)||a-b;
  })[0]:Math.min(...(supports.length?supports:model.nodes).map(n=>n[cutAxis]));
  const cross=(p:CadPiece):P|null=>{
    const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
    if(a[cutAxis]===b[cutAxis]||sectionPosition<Math.min(a[cutAxis],b[cutAxis])||sectionPosition>Math.max(a[cutAxis],b[cutAxis]))return null;
    const t=(sectionPosition-a[cutAxis])/(b[cutAxis]-a[cutAxis]);return [a[across]+t*(b[across]-a[across]),a.z+t*(b.z-a.z)];
  };
  const crossings=purlins.flatMap(p=>{const c=cross(p);return c?[c]:[];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const distinct=crossings.filter((p,i)=>!i||p.some((v,k)=>v!==crossings[i-1][k]));

  type View="plan"|"front"|"side"|"cut";
  type DrawOptions={pieces?:CadPiece[];showRoof?:boolean;bases?:boolean;noMarks?:boolean;subtitle?:string;aliases?:Map<string,string[]>;frame?:boolean;tercas?:boolean;deduplicate?:boolean};
  function drawing(page:CadPage,rect:CadRect,name:string,view:View,opts:DrawOptions={}){
    let pieces=opts.pieces??model.pieces;const showRoof=opts.showRoof??true;
    const horizontal=view==="side"?"y":view==="cut"?across:"x";
    const extentNodes=[...pieces.flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]),...(showRoof?roof:[])];
    const xSpan=Math.max(...extentNodes.map(n=>n.x))-Math.min(...extentNodes.map(n=>n.x));
    const ySpan=Math.max(...extentNodes.map(n=>n.y))-Math.min(...extentNodes.map(n=>n.y));
    const rotatePlan=view==="plan"&&rect.width>rect.height&&ySpan>xSpan;
    const projection=(n:{x:number;y:number;z:number}):P=>view==="plan"
      ?(rotatePlan?[n.y,-n.x]:[n.x,n.y]):[n[horizontal],n.z];
    if(opts.deduplicate){
      const projected=new Map<string,CadPiece>();
      for(const p of pieces){
        const key=JSON.stringify([p.role,profile(p.id),[projection(nodes.get(p.start)!),projection(nodes.get(p.end)!)].sort((a,b)=>a[0]-b[0]||a[1]-b[1])]);
        if(!projected.has(key))projected.set(key,p);
      }
      pieces=[...projected.values()];
    }
    const points=opts.bases?(supports.length?supports:model.nodes):[...pieces.flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]),...(showRoof?roof:[])];
    const coords=points.map(projection);
    if(!coords.length)coords.push(...model.nodes.map(projection));
    // No corte frontal da tesoura, muros/calhas explicitamente informados também
    // entram nos limites gráficos. Isso nunca cria barras ou vínculos de cálculo.
    // Tesoura sobre pilares: os pilares já são peças do modelo; não há muro/calha a esquematizar.
    const trussContext=view==="cut"&&across==="x"&&!opts.bases&&project.workspace.trussEditor?.support!=="columns"?project.workspace.trussEditor:null;
    if(trussContext){
      const S=trussContext.roofKind==="two-slopes"?2:1,span=trussContext.spanMm,th=trussContext.walls.thicknessMm;
      for(const [x,h] of [[0,trussContext.walls.lowMm],[span,S===2?trussContext.walls.lowMm:trussContext.walls.highMm]])
        coords.push([x-th/2,0],[x+th/2,h]);
      const gutterBottom=trussContext.supportZMm-Math.max(trussContext.gutter.lowSideMm,trussContext.gutter.highSideMm);
      coords.push([0,gutterBottom],[span,gutterBottom]);
    }
    if(view!=="plan")coords.push([coords[0][0],datum]);
    const minX=Math.min(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1]));
    const width=Math.max(...coords.map(p=>p[0]))-minX,height=Math.max(...coords.map(p=>p[1]))-minY;
    const solo=rect.width>=book.area.width*.94&&rect.height>=book.area.height*.94;
    // Trusses get one height dimension per vertical; a second stacked chain of
    // level dimensions would duplicate them and push annotation off the sheet.
    const trussHeights=!!opts.frame&&pieces.some(p=>p.role==="topChord")&&pieces.some(p=>p.role==="bottomChord");
    const levelValues=view==="plan"||trussHeights?[]:
      (showRoof?unique(roof.map(n=>n.z)):unique(points.map(n=>n.z))).filter(z=>z!==datum);
    // Stacked level dimensions sit LEFT of the drawing (10 mm + 7 mm per
    // level + text). Reserve that paper so the viewport never clips them.
    const levelReserve=levelValues.length?14+(levelValues.length-1)*7:0;
    // Dimensions, axis lines and bubbles are always drawn OUTSIDE the
    // geometry (below / left / above), never through it. Reserve that paper
    // so the native viewport does not clip them. Solo sheets also keep the
    // pending-note band at the top clear of the drawing.
    const left=Math.max(view==="plan"&&!opts.noMarks?24:14,levelReserve);
    const bottom=opts.noMarks?16:trussHeights?34:26,top=solo?27:14,right=solo?6:14;
    const available={x:left,y:bottom,width:Math.max(20,rect.width-left-right),height:Math.max(20,rect.height-bottom-top)};
    const scale=book.scale(width,height,available),maxX=minX+width,maxY=minY+height;
    book.view(page,rect,name,scale,space=>{
      const originX=available.x+(available.width-width/scale)/2,originY=available.y+(available.height-height/scale)/2;
      const at=(p:P):P=>[originX+(p[0]-minX)/scale,originY+(p[1]-minY)/scale];
      const subtitle=opts.subtitle??(view==="cut"?`Corte ${cutAxis.toUpperCase()}=${num(sectionPosition)} mm; representação por eixos.`:`Referência de altura Z=${num(datum)} mm.`);
      if(!solo)book.text(space,[2,rect.height-4],subtitle,"TEXTOS",1.8);
      const pendingNotes:string[]=[];
      if(opts.frame)pendingNotes.push(
        "PENDENTE: contato geométrico apenas para desenho; juntas, apoios e comportamento estrutural não verificados.");
      const disputed=pieces.filter(p=>dimensionByPiece.get(p.id)?.status==="PENDENTE");
      if(disputed.length)pendingNotes.push(
        `PENDENTE — COTAS: ${disputed.map(p=>p.id).join(", ")}. Ver folha de divergências.`);
      const mismatch=roofSlopeReviews.filter(r=>r.status==="PENDENTE"&&pieces.some(p=>p.id===r.pieceId));
      if(mismatch.length)pendingNotes.push(
        `PENDENTE — INCLINAÇÃO FACE/BANZO: ${mismatch.map(r=>r.pieceId).join(", ")}. Ver divergências.`);

      book.graphicScale(space,[rect.width-56,solo?rect.height-15:3],scale);
      const occupied:{x:number;y:number;width:number;height:number}[]=[];
      const reservedLabels:CadRect[]=[];
      const leaders:[P,P][]=[];
      const intersects=(a:P,b:P,c:P,d:P)=>{
        const o=(p:P,q:P,r:P)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
        return o(a,b,c)*o(a,b,d)<-1e-8&&o(c,d,a)*o(c,d,b)<-1e-8;
      };
      let dense=false;
      const projectedNodes=points.map(n=>at(projection(n)));
      const segments=pieces.flatMap(p=>{
        const u=nodes.get(p.start)!,v=nodes.get(p.end)!;
        return view==="cut"&&(u[cutAxis]!==sectionPosition||v[cutAxis]!==sectionPosition)?[]:[[at(projection(u)),at(projection(v))] as [P,P]];
      });
      const distanceToSegment=(p:P,u:P,v:P)=>{
        const dx=v[0]-u[0],dy=v[1]-u[1],t=Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/(dx*dx+dy*dy||1)));
        return Math.hypot(p[0]-u[0]-t*dx,p[1]-u[1]-t*dy);
      };
      // Leaders are rejected if they intersect other leaders, non-target
      // members or dimension lines. When placement fails: use materials table.
      const label=(anchor:P,id:string)=>{
        const radius=Math.max(3,id.length*.72+1.2);
        for(let i=0;i<208;i++){
          const angle=(i%16)*Math.PI/8,distance=8+Math.floor(i/16)*4;
          const x=anchor[0]+Math.cos(angle)*distance,y=anchor[1]+Math.sin(angle)*distance;
          if(x<radius+2||x>rect.width-radius-2||y<radius+2||y>rect.height-9-radius)continue;
          const tip:P=[x-(x-anchor[0])/distance*radius,y-(y-anchor[1])/distance*radius];
          if(projectedNodes.some(p=>Math.hypot(p[0]-x,p[1]-y)<radius+2))continue;
          if(reservedLabels.some(r=>Math.hypot(Math.max(r.x-x,0,x-r.x-r.width),Math.max(r.y-y,0,y-r.y-r.height))<radius+1))continue;
          if(segments.some(([u,v])=>distanceToSegment([x,y],u,v)<radius+1.5||
            (intersects(anchor,tip,u,v)&&distanceToSegment(anchor,u,v)>1)))continue;
          if(book.dimensionObstacles(space).some(([u,v])=>distanceToSegment([x,y],u,v)<radius+3||
            intersects(anchor,tip,u,v)))continue;
          if(occupied.some(b=>Math.hypot(x-b.x,y-b.y)<radius+b.width+2))continue;
          if(leaders.some(([u,v])=>intersects(anchor,tip,u,v)))continue;
          leaders.push([anchor,tip]);
          occupied.push({x,y,width:radius,height:radius});
          book.poly(space,[anchor,tip],"MARCAS");
          book.circle(space,[x,y],radius,"MARCAS");
          const t=book.text(space,[x,y-.8],id,"MARCAS",2.1);
          t.horizontalAlignment=1;t.secondAlignmentPoint=point3d(x,y-.8);
          return;
        }
        dense=true;
      };
      const horizontalAxes=view==="plan"?(rotatePlan?ys:xs):horizontal==="x"?xs:ys;
      const axisName=(axis:"x"|"y",value:number)=>axis==="x"?axisLetter(xs.indexOf(value)):String(ys.indexOf(value)+1);
      const bubble=(p:P,value:string)=>{
        book.circle(space,p,3,"EIXOS");
        book.text(space,[p[0]-value.length*.7,p[1]-.9],value,"EIXOS",2.5);
        occupied.push({x:p[0],y:p[1],width:3,height:3});
      };
      if(!opts.noMarks)for(const value of horizontalAxes.filter(x=>x>=minX&&x<=maxX)){
        const q=at([value,minY]),end=at([value,maxY]);
        book.poly(space,[[q[0],q[1]-3],[end[0],end[1]+6]],"EIXOS");bubble([end[0],end[1]+9],axisName(view==="plan"&&rotatePlan?"y":view==="plan"?"x":horizontal,value));
      }
      const hv=horizontalAxes.filter(x=>x>=minX&&x<=maxX);
      if(!opts.noMarks)for(let i=1;i<hv.length;i++)book.dim(space,at([hv[i-1],minY]),at([hv[i],minY]),scale,`EIXOS ${axisName(view==="plan"&&rotatePlan?"y":view==="plan"?"x":horizontal,hv[i-1])}-${axisName(view==="plan"&&rotatePlan?"y":view==="plan"?"x":horizontal,hv[i])}`,trussHeights?-20:-8);
      if(view==="plan"){
        if(!opts.noMarks)for(const value of (rotatePlan?xs.map(v=>-v):ys).filter(y=>y>=minY&&y<=maxY)){
          const a=at([minX,value]),b=at([maxX,value]);book.poly(space,[[a[0]-3,a[1]],[b[0]+3,b[1]]],"EIXOS");bubble([a[0]-7,a[1]],axisName(rotatePlan?"x":"y",rotatePlan?-value:value));
        }
        const vv=(rotatePlan?xs.map(v=>-v):ys).filter(y=>y>=minY&&y<=maxY).sort((a,b)=>a-b);
        if(!opts.noMarks)for(let i=1;i<vv.length;i++)book.dim(space,at([minX,vv[i-1]]),at([minX,vv[i]]),scale,`VÃO Y ${axisName(rotatePlan?"x":"y",rotatePlan?-vv[i-1]:vv[i-1])}-${axisName(rotatePlan?"x":"y",rotatePlan?-vv[i]:vv[i])}`,19);
        if(name==="PLANTA"){
          const a:P=cutAxis==="y"?[minX,sectionPosition]:[sectionPosition,minY],b:P=cutAxis==="y"?[maxX,sectionPosition]:[sectionPosition,maxY];
          book.poly(space,[at(a),at(b)],"EIXOS");book.text(space,at(a),"A-A","EIXOS");
        }
      }
      const roofSegments:[P,P][]=[],roofSegmentKeys=new Set<string>();
      const roofSegment=(a:P,b:P)=>{
        if(a.every((v,i)=>v===b[i]))return;
        const key=[a.join(","),b.join(",")].sort().join(";");if(roofSegmentKeys.has(key))return;roofSegmentKeys.add(key);
        roofSegments.push([a,b]);segments.push([at(a),at(b)]);book.poly(space,[at(a),at(b)],"COBERTURA");
      };
      if(showRoof&&!opts.bases)for(const face of faces){
        if(view==="cut"){
          const intersections:P[]=[];
          for(const ring of [face.outer,...face.holes])for(let i=1;i<ring.length;i++){
            const av=ring[i-1],bv=ring[i],a={x:av[0],y:av[1],z:av[2]},b={x:bv[0],y:bv[1],z:bv[2]};
            if(a[cutAxis]===sectionPosition&&b[cutAxis]===sectionPosition)roofSegment(projection(a),projection(b));
            else if((a[cutAxis]<=sectionPosition&&b[cutAxis]>sectionPosition)||(b[cutAxis]<=sectionPosition&&a[cutAxis]>sectionPosition)){
              const t=(sectionPosition-a[cutAxis])/(b[cutAxis]-a[cutAxis]);intersections.push([a[horizontal]+t*(b[horizontal]-a[horizontal]),a.z+t*(b.z-a.z)]);
            }
          }
          intersections.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
          for(let i=1;i<intersections.length;i+=2)roofSegment(intersections[i-1],intersections[i]);
        }else for(const ring of [face.outer,...face.holes]){
          const projected=ring.map(([x,y,z])=>at(projection({x,y,z})));book.poly(space,projected,"COBERTURA");
          for(let i=1;i<projected.length;i++)segments.push([projected[i-1],projected[i]]);
        }
      }
      if(trussContext){
        const t=trussContext,S=t.roofKind==="two-slopes"?2:1,span=t.spanMm,th=t.walls.thicknessMm;
        // Esquema arquitetônico no CORTE, exclusivamente com dados cadastrados.
        // Camadas existentes: BARRAS_AUXILIARES (muros) e COBERTURA (calhas).
        for(const [i,x,h] of [[0,0,t.walls.lowMm],[1,span,S===2?t.walls.lowMm:t.walls.highMm]]){
          const wall:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[
            [x-th/2,0],[x+th/2,0],[x+th/2,h],[x-th/2,h],[x-th/2,0]
          ];
          book.poly(space,wall.map(at),"BARRAS_AUXILIARES");
          book.text(space,at([x+th/2+70,Math.max(h/2,100)]),i===0?"MURO BAIXO (ESQUEMA)":S===2?"MURO OUTRO BEIRAL (ESQUEMA)":"MURO ALTO (ESQUEMA)","TEXTOS",1.8);
        }
        const g=t.gutter,bottom=t.supportZMm-Math.max(g.lowSideMm,g.highSideMm);
        const positions=S===2?[g.supportMm,span-g.supportMm-g.widthMm]:[g.supportMm];
        for(const [index,x] of positions.entries()){
          const outline:P[]=[[x,bottom+g.lowSideMm],[x,bottom],[x+g.widthMm,bottom],[x+g.widthMm,bottom+g.highSideMm]];
          book.poly(space,outline.map(at),"COBERTURA");
          book.text(space,at([x,bottom-70]),`CALHA ${index+1} - ESQUEMA`,"TEXTOS",1.8);
        }
        pendingNotes.push("PENDENTE: MUROS E CALHAS apenas representacao esquematica no corte; cotas e materiais conforme editor. Sem verificacao estrutural/hidraulica.");
        pendingNotes.push(`PENDENTE: CHAPAS ${t.anchor.plateWidthMm}x${t.anchor.plateHeightMm} mm; ${t.anchor.boltsPerSupport} chumbador(es) por posicao, L=${t.anchor.boltLengthMm} mm. Furos/ligacoes sem detalhe validado.`);
      }
      const supportLabels=new Map<string,{point:P;marks:string[]}>();
      for(const n of supports){
        if(opts.frame&&!pieces.some(p=>p.start===n.id||p.end===n.id))continue;
        if(view==="cut"&&n[cutAxis]!==sectionPosition)continue;
        const q=at(projection(n)),key=q.join(","),row=supportLabels.get(key)??{point:q,marks:[]};row.marks.push(supportMarks.get(n.id)!);supportLabels.set(key,row);
      }
      for(const {point:q,marks} of supportLabels.values()){
        book.poly(space,[[q[0],q[1]],[q[0]-1.5,q[1]-2],[q[0]+1.5,q[1]-2],[q[0],q[1]]],"APOIOS");
        book.text(space,[q[0]+2,q[1]-3],marks.join("/"),"APOIOS",2);
        reservedLabels.push({x:q[0]+2,y:q[1]-4,width:marks.join("/").length*1.6,height:3});
      }
      if(opts.noMarks){
        // Positive normal = up / left: horizontal below, vertical left.
        book.dim(space,at([minX,minY]),at([maxX,minY]),scale,"EXTENSÃO",-10);
        book.dim(space,at([minX,minY]),at([minX,maxY]),scale,"EXTENSÃO",10);
      }else if(width>0&&!(hv.length===2&&hv[0]===minX&&hv[1]===maxX))
        book.dim(space,at([minX,minY]),at([maxX,minY]),scale,"EXTENSÃO",(hv.length>1&&!opts.noMarks)?(trussHeights?-28:-20):(trussHeights?-20:-8));
      if(view!=="plan"){
        for(const [i,z] of levelValues.entries()){
          const candidates=view==="cut"?roofSegments.flat().filter(p=>p[1]===z):roof.filter(p=>p.z===z).map(p=>projection(p));
          const actual=candidates.sort((a,b)=>a[0]-b[0])[0]??[minX,z];
          book.dim(space,at([actual[0],datum]),at(actual),scale,showRoof?(ridge.includes(z)?"CUMEEIRA":"BORDA/BEIRAL"):"NÍVEL",(actual[0]-minX)/scale+10+i*7);
        }
        if(showRoof&&!roof.length)pendingNotes.push("PENDENTE: cobertura física não declarada; alturas não inferidas.");
      }
      if(view==="cut"){
        if(distinct.length<=12)for(let i=1;i<distinct.length;i++)book.dim(space,at(distinct[i-1]),at(distinct[i]),scale,"EIXOS TERÇAS",5);
        else book.dim(space,at(distinct[0]),at(distinct.at(-1)!),scale,"TERÇAS: ver ESPACAMENTOS",5);
        if(distinct.length<2)pendingNotes.push("PENDENTE: sequência de terças não identificada neste corte.");
      }
      if(opts.tercas){
        const values=unique(distinct.map(p=>p[0]));
        // A paper dimension needs room for its own number. Dense sequences are
        // fully retained in the spacing table instead of overprinting labels.
        const legible=values.length<=12&&values.slice(1).every((v,i)=>(v-values[i])/scale>=14);
        const marked=legible?values:[values[0],values.at(-1)!];
        for(let i=1;i<marked.length;i++){
          const a:P=cutAxis==="y"?[marked[i-1],minY]:[minX,marked[i-1]],b:P=cutAxis==="y"?[marked[i],minY]:[minX,marked[i]];
          book.dim(space,at(a),at(b),scale,legible?"TERÇAS PROJ.":"TERÇAS: ver ESPACAMENTOS",-13);
        }
        if(!model.pieces.some(isDeclaredBrace))
          pendingNotes.push("PENDENTE: contraventamentos não declarados; sem comprovação de contenção.");
      }
      if(opts.bases){
        book.text(space,[2,rect.height-9],"PENDENTE DE PROJETO (A4/A5)","PENDENCIAS",2.5);
        book.text(space,[2,10],"Nós de apoio; chapas, furos, chumbadores e soldas não dimensionados.","PENDENCIAS",1.8);
      }
      if(!supports.length&&page.name==="PLANTAS")
        pendingNotes.push("PENDENTE: apoios não declarados; nenhum apoio foi criado.");
      // Truss dimensions are drawn BEFORE member labels so balloons avoid them.
      // Graphic dimensions only. Inferred visual contacts with chord axes do
      // not become declared joints or solver restraints.
      if(opts.frame&&pieces.some(p=>p.role==="topChord")&&pieces.some(p=>p.role==="bottomChord")){
        const webs=pieces.filter(p=>p.role==="web"&&!isDeclaredBrace(p)).filter(p=>{
          const u=nodes.get(p.start)!,v=nodes.get(p.end)!;
          return Math.hypot(u.x-v.x,u.y-v.y)<=1;
        }).sort((p,q)=>{
          const u=nodes.get(p.start)!,v=nodes.get(q.start)!;
          return u[horizontal]-v[horizontal];
        });
        const bottoms=pieces.filter(p=>p.role==="bottomChord").flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]);
        const bottomZ=bottoms.length?Math.min(...bottoms.map(n=>n.z)):datum;
        // Dense trusses (many verticals): dimension only the two end heights.
        // Every vertical length is in the identification table; 16 height
        // dimensions plus 15 diagonal marks overprinted each other.
        const heightWebs=webs.length>8?[webs[0],webs.at(-1)!]:webs;
        for(const [i,p] of heightWebs.entries()){
          const u=nodes.get(p.start)!,v=nodes.get(p.end)!;
          book.dim(space,at(projection(u)),at(projection(v)),scale,
            `ALTURA MONTANTE ${marks.get(p.id)}`,webs.length>8?(i===0?7:-7):i%2===0?-7:7);
        }
        if(webs.length>8)pendingNotes.push(`Alturas dos ${webs.length} montantes: ver tabela de identificação (cotadas aqui só as extremidades).`);
        for(let i=1;i<webs.length;i++){
          const u=nodes.get(webs[i-1].start)!,v=nodes.get(webs[i].start)!;
          const a:P=[u[horizontal],bottomZ],b:P=[v[horizontal],bottomZ];
          if(Math.abs(b[0]-a[0])>1e-5)book.dim(space,at(a),at(b),scale,"PAINEL ENTRE MONTANTES",-10);
        }
      }
      const labelledTypes=new Set<string>();
      if(!opts.bases)for(const p of pieces){
        const a=nodes.get(p.start)!,b=nodes.get(p.end)!,mark=marks.get(p.id)!;
        const count=markCounts.get(mark)??1,id=count>1?`${mark} ×${count}`:mark;
        const layer=isDeclaredBrace(p)?"CONTRAVENTOS":p.role==="web"&&opts.tercas?"BARRAS_AUXILIARES":"PERFIS";
        const first=!labelledTypes.has(mark)&&!opts.noMarks;labelledTypes.add(mark);
        if(view==="cut"&&!(a[cutAxis]===sectionPosition&&b[cutAxis]===sectionPosition)){
          const c=cross(p);if(c){const q=at(c);book.circle(space,q,.7,layer);if(first)label(q,id);}
          continue;
        }
        const u=at(projection(a)),v=at(projection(b)),length=Math.hypot(v[0]-u[0],v[1]-u[1]);
        if(first&&length>=34){
          const mx=(u[0]+v[0])/2,my=(u[1]+v[1])/2;
          const samePoint=segments.filter(([c,d])=>distanceToSegment([mx,my],c,d)<1.4);
          const textWidth=Math.min(21,id.length*1.5+2),gap=textWidth+3;
          const clear=samePoint.length<=1&&length>gap+12&&
            !occupied.some(o=>Math.hypot(o.x-mx,o.y-my)<o.width+textWidth)&&
            !reservedLabels.some(r=>mx>=r.x-10&&mx<=r.x+r.width+10&&my>=r.y-4&&my<=r.y+r.height+4);
          if(clear){
            const dx=(v[0]-u[0])/length,dy=(v[1]-u[1])/length;
            const left:P=[mx-dx*gap/2,my-dy*gap/2],right:P=[mx+dx*gap/2,my+dy*gap/2];
            book.poly(space,[u,left],layer);book.poly(space,[right,v],layer);
            const angle0=Math.atan2(dy,dx)*180/Math.PI;
            const angle=angle0>90?angle0-180:angle0< -90?angle0+180:angle0;
            const t=book.text(space,[mx,my-.7],id,"MARCAS",2.1);
            t.rotation=angle;t.horizontalAlignment=1;t.secondAlignmentPoint=point3d(mx,my-.7);
            occupied.push({x:mx,y:my,width:textWidth/2,height:3});
            continue;
          }
        }
        book.poly(space,[u,v],layer);
        if(first)label([(u[0]+v[0])/2,(u[1]+v[1])/2],id);
      }
      if(dense)pendingNotes.push("PENDENTE: marcas densas; conferir tabela de peças.");
      let noteY=rect.height-9;
      for(const note of pendingNotes)for(const line of book.wrap(note,rect.width-8,1.75)){
        book.text(space,[3,noteY],line,"PENDENCIAS",1.75);noteY-=3.1;
      }
    });
  }
  const a=book.area,gap=12,half=(a.width-gap)/2;
  const installed=model.pieces.filter(p=>!unlocated.has(p.id));
  const plans=book.add("PLANTAS","Plantas de cobertura e estrutura");
  const expanded=model.pieces.length>=28;
  const purlinPlan=expanded?book.add("TERCAS","Planta de terças e contraventamentos"):plans;
  const markingPage=expanded?book.add("MARCACAO","Planta de marcação de peças"):null;
  const spacingPage=distinct.length>=2?(expanded?book.add("ESPACAMENTOS","Espaçamentos entre terças"):plans):null;
  const elevations=book.add("ELEVACOES","Elevações e corte transversal");
  const sideElevation=expanded?book.add("ELEVACAO LATERAL","Elevação lateral"):elevations;
  const hasMeaningfulSection=distinct.length>=2&&faces.length>0;
  const crossSection=hasMeaningfulSection?(expanded?book.add("CORTE A-A","Corte transversal A-A"):elevations):null;
  // A frame drawn beside its identification table is limited to 69 % of the
  // sheet. When the full width allows a LARGER scale (e.g. an 8 m truss at
  // 1:25 instead of 1:50), the drawing takes the sheet and the table moves to
  // the next sheet: dimension texts and member marks stop colliding.
  const frameWide=data.frameGroups.map(group=>{
    const f=group[0],h=f.axis==="y"?"x":"y",pts=f.pieces.flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]);
    const span=Math.max(...pts.map(n=>n[h]))-Math.min(...pts.map(n=>n[h])),rise=Math.max(...pts.map(n=>n.z))-Math.min(...pts.map(n=>n.z));
    const narrow=book.scale(span,rise,{x:0,y:0,width:a.width*.69-28,height:a.height-40});
    const wide=book.scale(span,rise,{x:0,y:0,width:a.width-20,height:a.height-53});
    // Only when the frame would be small (smaller than 1:25) and the full
    // sheet at least doubles its size; otherwise keep drawing and table together.
    return narrow>25&&wide*2<=narrow;
  });
  const framePages=data.frameGroups.map((group,i)=>{
    // Com tipos do editor de tesoura, a prancha usa o nome do tipo (o mesmo da tela).
    const editor=project.workspace.trussEditor,firstTruss=group[0].pieces.find(p=>/^T(\d+)-/.test(p.id));
    const line=editor?.types.length?Number(/^T(\d+)-/.exec(firstTruss?.id??"")?.[1]??0)-1:-1;
    const named=editor&&line>=0&&line<editor.trusses?typeName(editor,lineTypeId(editor,line)):null;
    const title=`${group[0].kind==="TESOURA"?"Tesoura":"Pórtico"} — ${named??`tipo ${i+1}`} (${group.length}×)`;
    const drawingPage=book.add(`${group[0].kind} ${i+1}`,title);
    return {drawingPage,tablePage:frameWide[i]?book.add(`${group[0].kind} ${i+1} PECAS`,`${title} — identificação de peças`):drawingPage};
  });
  const pendingFrame=!framePages.length?book.add("PORTICOS PENDENTE","Pórticos e tesouras — identificação pendente"):null;
  const bases=supports.length?book.add("BASES","Locação de bases e chumbadores"):null;
  const notes=book.add("NOTAS","Notas gerais");
  const materialsPage=book.add("MATERIAIS","Lista de materiais e resumo por perfil");
  // The index now receives its own sheet after pagination. It never steals
  // drawing height or forces the roof onto a tiny half-width first view.
  const viewTop=a.y+a.height-24,viewBottom=a.y+42,viewHeight=viewTop-viewBottom;
  drawing(plans,expanded?a:{x:a.x,y:viewBottom,width:half,height:viewHeight},"Planta de cobertura e apoios","plan",
    {pieces:expanded?installed.filter(p=>p.role==="column"||p.role==="topChord"||p.role==="beam"):installed,noMarks:true,
      subtitle:"Planta de cobertura: cotas gerais. Marcas e locações ver folhas próprias."});
  const auxiliaries=installed.filter(p=>p.role==="purlin"||isDeclaredBrace(p)||(p.role==="web"&&!data.frames.some(f=>f.pieces.includes(p))));
  drawing(purlinPlan,expanded?a:{x:a.x+half+gap,y:viewBottom,width:half,height:viewHeight},"Terças e contraventamentos","plan",{pieces:auxiliaries.length?auxiliaries:model.pieces,tercas:true,
    subtitle:"Marcas vinculadas à lista de materiais; espaçamentos projetados."});
  if(markingPage)drawing(markingPage,a,"Planta de marcação de peças","plan",
    {pieces:installed,showRoof:false,subtitle:"Peças instaladas no modelo; itens sem locação apenas na tabela de pendências."});
  if(distinct.length>=2&&spacingPage){
    const ids=(point:P)=>purlins.filter(p=>{const c=cross(p);return c&&c[0]===point[0]&&c[1]===point[1];}).map(p=>marks.get(p.id)).join(" / ");
    book.table(spacingPage,expanded?a:{...a,height:35},"Espaçamentos entre terças no corte",["Marcas","Posição 1 / Z (mm)","Posição 2 / Z (mm)","Projeção (mm)","No corte (mm)"],distinct.slice(1).map((b,i)=>{
      const c=distinct[i];return [`${ids(c)} → ${ids(b)}`,`${num(c[0])} / ${num(c[1])}`,`${num(b[0])} / ${num(b[1])}`,num(b[0]-c[0]),num(Math.hypot(b[0]-c[0],b[1]-c[1]))];
    }),[0,.28,.48,.68,.84,1]);
  }
  const smallHeight=(a.height-gap)/2;
  const summaryOptions=expanded?{deduplicate:true,pieces:installed,subtitle:"Projeções coincidentes: marca representativa; todas as peças nas folhas individuais e na lista."}:{pieces:installed};
  drawing(elevations,expanded?a:{x:a.x,y:a.y+smallHeight+gap,width:half,height:smallHeight},"Elevação frontal","front",summaryOptions);
  drawing(sideElevation,expanded?a:{x:a.x,y:a.y,width:half,height:smallHeight},"Elevação lateral","side",expanded?{...summaryOptions,pieces:model.pieces.filter(p=>(p.role==="column"||p.role==="purlin"||isDeclaredBrace(p))&&!unlocated.has(p.id))}:{});
  if(crossSection)drawing(crossSection,expanded?a:{x:a.x+half+gap,y:a.y,width:half,height:a.height},"Corte A-A","cut",{pieces:installed});
  for(const [index,group] of data.frameGroups.entries()){
    const first=group[0],h=first.axis==="y"?"x":"y",{drawingPage:page,tablePage}=framePages[index],wide=frameWide[index];
    const token=(frame:typeof first,p:CadPiece)=>{
      const min=Math.min(...frame.pieces.flatMap(p=>[nodes.get(p.start)![h],nodes.get(p.end)![h]])),u=nodes.get(p.start)!,v=nodes.get(p.end)!;
      return JSON.stringify([u[h]-min,u.z,v[h]-min,v.z,p.role,profile(p.id)]);
    };
    const aliases=new Map(first.pieces.map(p=>[p.id,group.flatMap(f=>f.pieces.filter(q=>token(f,q)===token(first,p)).map(q=>q.id))]));
    const locations=group.map(f=>{
      const positions=f.pieces.flatMap(p=>[nodes.get(p.start)![h],nodes.get(p.end)![h]]);
      return `eixo ${f.axis==="y"?ys.indexOf(f.coordinate)+1:axisLetter(xs.indexOf(f.coordinate))}; ${f.axis.toUpperCase()}=${num(f.coordinate)}; ${h.toUpperCase()}=${num(Math.min(...positions))} a ${num(Math.max(...positions))} mm`;
    });
    drawing(page,wide?a:{...a,width:a.width*.69},first.kind==="TESOURA"?"Elevação da tesoura":"Elevação do pórtico",first.axis==="y"?"front":"side",{pieces:first.pieces,showRoof:false,frame:true,aliases,
      subtitle:`${group.length}× — peças correspondentes indicadas na tabela de identificação${wide?" (folha seguinte)":""}.`});
    book.table(tablePage,wide?a:{x:a.x+a.width*.70,y:a.y,width:a.width*.30,height:a.height},"Identificação de peças",["Marca","Perfil","Qtd.","Compr. mm","Locação"],first.pieces.map(p=>{
      const ids=aliases.get(p.id)??[p.id],u=nodes.get(p.start)!,v=nodes.get(p.end)!;
      // Length between node axes, as in the materials list (not a cut length).
      return [[...new Set(ids.map(id=>marks.get(id)))].join(" / "),profile(p.id),String(ids.length),num(Math.hypot(v.x-u.x,v.y-u.y,v.z-u.z)),locations.join("; ")];
    }),wide?[0,.10,.32,.38,.48,1]:[0,.16,.46,.54,.66,1]);
  }
  if(pendingFrame)pendingFrame.draw.push(space=>book.wrapped(space,a,"PENDENTE: conjunto de pórtico ou tesoura não identificado em planos globais com conectividade declarada. Nenhuma peça, pilar ou vínculo foi inferido. As peças permanecem nas vistas gerais e na lista de materiais.",3,5,"PENDENCIAS"));
  const reactions=cadReactions(project,options.reactions),baseHeight=reactions.data?a.height*.53:a.height;
  if(bases){
  drawing(bases,{x:a.x,y:a.y+a.height-baseHeight,width:half,height:baseHeight},"Locação de apoios","plan",{pieces:[],showRoof:false,bases:true,subtitle:"Coordenadas dos apoios declarados; não representa chapa ou fundação."});
  const typeNames:Record<string,string>={"steel-column":"Pilar metálico","existing-column":"Pilar existente","existing-beam":"Viga existente","concrete-beam":"Viga de concreto","concrete-column":"Pilar de concreto","masonry-wall":"Parede de alvenaria","foundation":"Fundação","wall":"Parede","beam":"Viga","column":"Pilar"};
  book.table(bases,{x:a.x+half+gap,y:a.y+a.height-baseHeight,width:half,height:baseHeight},"Posições de apoio",["Marca","Eixos","X / Y / Z (mm)","Vínculos / tipo"],supports.map(n=>{
    const support=draft!.supports.find(s=>s.nodeId===n.id)!,face=draft?.supportInterfaces?.find(f=>f.nodeId===n.id);
    const dofs=support.dofs.map(d=>d==="fixed"?"fixo":d==="free"?"livre":"PENDENTE").join(" / ");
    if(face)trace.push(`${supportMarks.get(n.id)}: tipo=${face.kind}`);
    return [supportMarks.get(n.id)!,data.location(n),`${num(n.x)} / ${num(n.y)} / ${num(n.z)}`,`${dofs}; ${face?(typeNames[face.kind]??"tipo: ver rastreabilidade"):"PENDENTE"}`];
  }),[0,.12,.24,.6,1],"APOIOS");
  if(reactions.data)book.table(bases,{...a,height:a.height*.43},"Reações concomitantes por combinação — eixos globais",["Apoio","Combinação","Fx (kN)","Fy (kN)","Fz (kN)","Mx (kNm)","My (kNm)","Mz (kNm)"],reactions.data.rows.map(r=>[
    supportMarks.get(r.nodeId)!,r.combinationId,...r.force.map(n=>reaction3(n/1000)),...r.moment.map(n=>reaction3(n/1000))]),[0,.08,.28,.4,.52,.64,.76,.88,1],"REACOES");
  else bases.draw.push(space=>book.wrapped(space,{x:a.x+half+gap,y:a.y,width:half,height:10},reactions.status,2,3,"PENDENCIAS"));

  }else trace.push("PENDENTE: nenhum apoio declarado; prancha de locação suprimida.");
  trace.push(reactions.status);
  const references=new Set<string>();
  const reference=(r:{standard:string;edition:string;clause:string;source:string;revision:string})=>{
    references.add(/^(ABNT\s+)?NBR\b|^(ISO|ASTM|EN|AISC)\b/.test(r.standard)?`${r.standard}; edição ${r.edition}; item ${r.clause}.`:"Referência técnica adicional declarada; identificação e edição constam na rastreabilidade.");
    trace.push(`${r.standard}; edição=${r.edition}; item=${r.clause}; fonte=${r.source}; revisão=${r.revision}`);
  };
  for(const c of draft?.engineeringCombinations?.combinations??[])for(const r of [c.reference,...c.terms.map(t=>t.reference)])reference(r);
  for(const action of draft?.engineeringCombinations?.actions??[])reference(action.reference);
  const wind=draft?.loading?.wind;
  if(wind){reference(wind.building.reference);reference(wind.building.velocityReference);for(const c of wind.cases){reference(c.reference);for(const z of c.zones)reference(z.reference);}}
  for(const p of draft?.normativeProvenance??[]){references.add(`PROVISÓRIO — ${p.standard}; edição ${p.edition}; aplicação não confirmada.`);trace.push(`${p.id}: ${p.origin}; ${p.reason}`);}
  for(const c of draft?.loading?.facadeTraction?.cases??[]){references.add("Pressões de fachada: norma e edição não inferidas de texto livre; conferir a fonte declarada.");trace.push(`Fachada: ${c.reference}`);}
  for(const s of draft?.resistanceStandards??[]){references.add(`${s.standard}: edição e aplicação integral PENDENTE.`);trace.push(`${marks.get(s.pieceId)}: ${s.standard}`);}
  const steels=new Set<string>(),provenance=new Map<string,string[]>();
  for(const piece of model.pieces){
    const assignment=draft?.physicalCatalog?.assignments.find(r=>r.pieceId===piece.id),material=draft?.physicalCatalog?.materials.find(m=>m.id===assignment?.materialId),group=draft?.groups[piece.role],m=material??group;
    const grade=m?.steelGrade?.trim()||(!project.workspace.physicalStructure?data.rows.get(piece.id)?.steelGrade:"")||"PENDENTE";
    steels.add(grade==="Synthetic isotropic reference"?"material sintético de referência analítica, sem especificação comercial":grade);
    const section=draft?.physicalCatalog?.sections.find(s=>s.id===assignment?.sectionId),s=section??group;
    const description=`aço=${assignment?.materialId??"PENDENTE"}; identificação=${grade}; fonte=${m?.materialSource?.trim()||"PENDENTE"}; revisão=${m?.materialRevision?.trim()||"PENDENTE"}; seção=${assignment?.sectionId??"PENDENTE"}; fonte=${s?.sectionSource?.trim()||"PENDENTE"}; revisão=${s?.sectionRevision?.trim()||"PENDENTE"}`;
    const groupMarks=provenance.get(description)??[];groupMarks.push(marks.get(piece.id)!);provenance.set(description,groupMarks);
  }
  for(const [description,groupMarks] of provenance)trace.push(`${groupMarks.join(",")}: ${description}`);
  book.notes(notes,a,[
    `Obra: ${project.name}. Revisão da geometria: ${model.revision}. ${CAD_NOTICE}.`,
    `Origem da geometria: ${model.provenance}. Medidas sem fonte física revisada não são levantamento de campo.`,
    ...(project.technicalNotes.trim()?[ `Observações declaradas: ${project.technicalNotes}` ]:[]),
    ...(trussAccounting&&project.workspace.trussEditor?.fullHeightBudget ? [`MONTANTES/DIAGONAIS: compra por medida cheia ${trussAccounting.buy.web} barras; corte geométrico real ${trussAccounting.bars.web} barras. Conferir ambas as contagens; não autorizam fabricação.`] : []),
    "Unidades: geometria e cotas em milímetros; massas em quilogramas; reações em quilonewtons e quilonewtons-metro. Eixos globais X e Y; eixo Z positivo para cima.",
    "As vistas representam eixos de peças declaradas. As cotas prevalecem sobre a medição gráfica. Os comprimentos são medidos entre nós, sem descontos de fabricação ou lista de corte.",
    "Marcas: C pilares, V vigas, T terças, BS/BI banzos, M montantes verticais; D exclusivamente diagonais e contraventamentos. Nenhuma marca atribui contenção estrutural.",
    "Pórticos e tesouras repetidos são agrupados somente quando geometria, perfis, materiais, orientações, vínculos e apoios declarados coincidem. A equivalência gráfica não equipara cargas ou aprovação.",
    `Aço declarado: ${[...steels].join("; ")}. As fontes e revisões constam na rastreabilidade. Informação ausente permanece PENDENTE.`,
    "Referências normativas declaradas no modelo; sua presença não comprova aplicação integral, revisão profissional ou homologação:",
    ...(references.size?[...references]:["PENDENTE: normas e respectivas edições não declaradas no modelo."]),
    "PENDENTE DE PROJETO: bases, chumbadores, chapas, furos, soldas, contato, ligações e fundações. Símbolos de apoio indicam apenas posições; não representam detalhes executivos ou capacidade verificada.",
    reactions.data?"As reações apresentadas foram conferidas contra a entrada atual. Permanecem experimentais e não representam capacidades de apoios, ligações ou fundações.":reactions.status,
    "Responsável técnico, CREA e ART devem ser preenchidos pelo profissional responsável após conferência. Campos em branco não autorizam execução. Os bloqueios de aprovação estrutural e fabricação permanecem ativos.",
    ...(!supports.length?["PENDENTE: sem apoios declarados; prancha de bases omitida, sem inventar fundações ou chumbadores."]:[]),
    ...(distinct.length<2?["PENDENTE: sem espaçamentos/corte verificáveis; pranchas vazias omitidas."]:[]),
    // One note per frame TYPE: identical frames repeat the same contacts and a
    // line per contact buried the notes (36 lines for three equal trusses).
    // Every contact pair stays listed, just grouped.
    ...data.frameGroups.filter(g=>g.some(f=>f.visualOnlyContacts.length)).map((group,i)=>{
      const contacts=group.flatMap(f=>f.visualOnlyContacts);
      return `PENDENTE: ${contacts.length} contatos somente gráficos em ${group.length} ${group[0].kind==="TESOURA"?"tesoura(s)":"pórtico(s)"} do tipo ${i+1} (montantes/diagonais tocando banzo contínuo fora de nó declarado), tolerância de 7 mm, sem criar ligação estrutural: ${contacts.join("; ")}.`;
    }),
    ...data.frames.flatMap(f=>f.omittedPieceIds.map(id=>`PENDENTE: ${id} do grupo ${f.kind} não entrou na elevação; conferir suas coordenadas.`)),
    ...roofSlopeReviews.filter(r=>r.status==="PENDENTE").map(r=>`PENDENTE — INCLINAÇÃO: ${r.pieceId}/${r.faceId}, subida ${num(r.modelRiseMm)} mm vs face ${num(r.expectedRiseMm)} mm; ${r.relation}.`),
    ...overallDimensionReviews.filter(r=>r.status==="PENDENTE").map(r=>`PENDENTE — COTA GERAL: eixo ${r.axis.toUpperCase()}, ${num(r.statedLengthMm)} mm declarados vs ${num(r.actualMm??0)} mm no contorno esquemático.`),
    ...(unlocated.size?[`PENDENTE: ${unlocated.size} peças sem locação retiradas do desenho e subtotal principal; conferir itens a confirmar.`]:[]),
    ...sourceDimensions.filter(r=>r.status==="PENDENTE").map(r=>`PENDENTE — DIVERGÊNCIA DIMENSIONAL ${r.pieceId}: cota fonte ${num(r.declaredMm)} mm, modelo ${r.actualMm===null?"não encontrado":num(r.actualMm)} mm, diferença ${r.discrepancyMm===null?"desconhecida":num(r.discrepancyMm)} mm; fonte ${r.source}.`)

  ],[...new Set(trace)].join(" | "));
  // Material list is by interchangeable TYPE mark; every distinct original
  // piece ID is retained individually in the trace/footer and CSV package.
  const materialTypes=new Map<string,typeof takeoff.pieces>();
  for(const p of takeoff.pieces.filter(p=>!unlocated.has(p.pieceId))){
    const mark=marks.get(p.pieceId)!,g=materialTypes.get(mark)??[];g.push(p);materialTypes.set(mark,g);
  }
  const detailHeight=a.height*.66;
  const detailBottom=book.table(materialsPage,
    {...a,y:a.y+a.height-detailHeight,height:detailHeight},
    "Relação de tipos de peças (IDs no quadro de rastreabilidade)",
    ["Marca","Perfil","Qtd.","Compr. por peça mm","Massa kg/m","Massa por peça kg","Massa total kg"],
    [...materialTypes.entries()].map(([mark,group])=>{
      const p=group[0],mass=group.some(v=>v.massKg===null)?null:group.reduce((v,q)=>v+q.massKg!,0);
      // Grouped rows share one type signature; keep the unit mass visible so
      // a fabricator can check a single piece without dividing the total.
      return [mark,profile(p.pieceId),String(group.length),num(p.lengthMm),
        mass===null?"PENDENTE":mass1(mass/(group.reduce((v,q)=>v+q.lengthMm,0)/1000)),
        mass===null?"PENDENTE":mass1(mass/group.length),
        mass===null?"PENDENTE":mass1(mass)];
    }),[0,.10,.40,.47,.62,.74,.87,1]);
  const summary=new Map<string,{profile:string;quantity:number;length:number;mass:number|null}>();
  for(const p of takeoff.pieces.filter(p=>!unlocated.has(p.pieceId))){
    const assignment=draft?.physicalCatalog?.assignments.find(a=>a.pieceId===p.pieceId),key=JSON.stringify([assignment?.sectionId??p.sectionId??p.pieceId,assignment?.materialId??p.materialId??p.pieceId]);
    const row=summary.get(key)??{profile:profile(p.pieceId),quantity:0,length:0,mass:0};row.quantity++;row.length+=p.lengthMm;
    row.mass=row.mass===null||p.massKg===null?null:row.mass+p.massKg;summary.set(key,row);
  }
  book.table(materialsPage,{...a,height:Math.max(22,detailBottom-8-a.y)},"Resumo por perfil e material",["Perfil declarado","Qtd.","Comprimento total (mm)","Massa total (kg)"],[...summary.values()].map(r=>[
    r.profile,String(r.quantity),num(r.length),r.mass===null?"PENDENTE":mass1(r.mass)]),[0,.42,.5,.76,1],"MATERIAIS",
    `ESCOPO PRINCIPAL (SEM AVULSAS): ${takeoff.pieces.length-unlocated.size} peças; ${num(takeoff.pieces.filter(p=>!unlocated.has(p.pieceId)).reduce((v,p)=>v+p.lengthMm,0))} mm. Itens a confirmar em folha própria.`);
  if(unlocated.size){
    const pendingPage=book.add("ITENS A CONFIRMAR","Peças sem locação — fora do orçamento principal");
    book.table(pendingPage,a,"Itens a confirmar",["Marca","ID peça","Perfil","Comprimento mm","Estado"],takeoff.pieces.filter(p=>unlocated.has(p.pieceId)).map(p=>[
      marks.get(p.pieceId)!,p.pieceId,profile(p.pieceId),num(p.lengthMm),"SEM LOCAÇÃO"]),[0,.1,.27,.64,.8,1],"PENDENCIAS");
  }
  const dimensionalWarnings=sourceDimensions.filter(r=>r.status==="PENDENTE");
  const slopeWarnings=roofSlopeReviews.filter(r=>r.status==="PENDENTE");
  const envelopeWarnings=overallDimensionReviews.filter(r=>r.status==="PENDENTE");
  if(dimensionalWarnings.length||slopeWarnings.length||envelopeWarnings.length){
    const reviewPage=book.add("DIVERGENCIAS","Pendências geométricas do desenho");
    const rows=[
      ...dimensionalWarnings.map(r=>[r.pieceId,num(r.declaredMm),r.actualMm===null?"PENDENTE":num(r.actualMm),
        r.discrepancyMm===null?"PENDENTE":num(r.discrepancyMm),"COTA DE PEÇA"]),
      ...slopeWarnings.map(r=>[r.pieceId,`FACE ${r.faceId}`,num(r.modelRiseMm),
        num(r.deltaMm),"INCLINAÇÃO PENDENTE"]),
      ...envelopeWarnings.map(r=>[`EIXO ${r.axis.toUpperCase()}`,num(r.statedLengthMm),num(r.actualMm??0),
        num(r.discrepancyMm??0),"COTA GERAL PENDENTE"]),
    ];
    book.table(reviewPage,a,"Divergências: cota fonte, modelo e inclinação; verificar antes de executar",
      ["Peça/eixo","Declarado/face","Modelo/subida mm","Diferença mm","Ação"],rows,
      [0,.13,.34,.57,.74,1],"PENDENCIAS");
  }
  const indexPage=book.add("INDICE","Índice geral de pranchas");
  book.table(indexPage,a,"Índice completo",["Folha","Conteúdo"],book.pages.map((p,i)=>[String(i+1),p.title]),[0,.1,1],"TEXTOS");
  book.render();
  return book.scenes;
}
