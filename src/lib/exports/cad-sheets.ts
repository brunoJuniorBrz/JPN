import {type DxfWriter,point3d} from "@tarikjabiri/dxf";
import type {Project} from "@/domain/models";
import {CadBook,CAD_NOTICE,cadNumber as num,cleanCadText,type PaperFormat,type Point2 as P} from "./cad-book";
import {cadModel,cadReactions,axisLetter,sortedCoordinates as unique,isDeclaredBrace,type CadPiece,type CadReactionReceipt} from "./cad-model";
export {CAD_NOTICE};
export type CadExportOptions={format?:PaperFormat;reactions?:CadReactionReceipt};

export function addPhysicalSheets(dxf:DxfWriter,project:Project,issuedAt:Date,options:CadExportOptions={}){
  const data=cadModel(project),{model,draft,takeoff,nodes,profile,supports,xs,ys}=data;
  const book=new CadBook(dxf,options.format??"A3",project.name,model.revision,issuedAt);
  const datum=Math.min(...(supports.length?supports:model.nodes).map(n=>n.z));
  const faces=draft?.physicalRoofFaces?.faces??[],roof=faces.flatMap(f=>f.outer.map(([x,y,z])=>({x,y,z})));
  const ridge=faces.flatMap((f,i)=>faces.slice(i+1).flatMap(g=>{
    const common=f.outer.filter(p=>g.outer.some(q=>q.every((v,k)=>v===p[k])));
    const edge=[...new Map(common.map(p=>[p.join(","),p])).values()];
    if(edge.length!==2||edge[0][2]!==edge[1][2])return [];
    const h=edge[0][2];return [f,g].every(face=>face.outer.some(p=>p[2]<h)&&face.outer.every(p=>p[2]<=h))?[h]:[];
  }));
  const purlins=model.pieces.filter(p=>p.role==="purlin");
  const yDirection=purlins.reduce((s,p)=>s+Math.abs(nodes.get(p.end)!.y-nodes.get(p.start)!.y),0);
  const xDirection=purlins.reduce((s,p)=>s+Math.abs(nodes.get(p.end)!.x-nodes.get(p.start)!.x),0);
  const cutAxis=yDirection>=xDirection?"y":"x",across=cutAxis==="y"?"x":"y";
  const sectionPosition=Math.min(...(supports.length?supports:model.nodes).map(n=>n[cutAxis]));
  const cross=(p:CadPiece):P|null=>{
    const a=nodes.get(p.start)!,b=nodes.get(p.end)!;
    if(a[cutAxis]===b[cutAxis]||sectionPosition<Math.min(a[cutAxis],b[cutAxis])||sectionPosition>Math.max(a[cutAxis],b[cutAxis]))return null;
    const t=(sectionPosition-a[cutAxis])/(b[cutAxis]-a[cutAxis]);return [a[across]+t*(b[across]-a[across]),a.z+t*(b.z-a.z)];
  };
  const crossings=purlins.flatMap(p=>{const c=cross(p);return c?[c]:[];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const distinct=crossings.filter((p,i)=>!i||p.some((v,k)=>v!==crossings[i-1][k]));

  type View="plan"|"front"|"side"|"cut";
  type DrawOptions={pieces?:CadPiece[];showRoof?:boolean;bases?:boolean;subtitle?:string;aliases?:Map<string,string[]>;frame?:boolean};
  function drawing(name:string,view:View,opts:DrawOptions={}){
    const pieces=opts.pieces??model.pieces,showRoof=opts.showRoof??true;
    const horizontal=view==="side"?"y":view==="cut"?across:"x";
    const projection=(n:{x:number;y:number;z:number}):P=>view==="plan"?[n.x,n.y]:[n[horizontal],n.z];
    const points=opts.bases?(supports.length?supports:model.nodes):[...pieces.flatMap(p=>[nodes.get(p.start)!,nodes.get(p.end)!]),...(showRoof?roof:[])];
    const coords=points.map(projection);
    if(view!=="plan")coords.push([coords[0][0],datum]);
    const minX=Math.min(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1]));
    const width=Math.max(...coords.map(p=>p[0]))-minX,height=Math.max(...coords.map(p=>p[1]))-minY;
    const scale=book.scale(width,height),maxX=minX+width,maxY=minY+height;
    book.add(name,scale,space=>{
      const originX=40+(book.width-90-width/scale)/2,originY=105+(book.height-172-height/scale)/2;
      const at=(p:P):P=>[originX+(p[0]-minX)/scale,originY+(p[1]-minY)/scale];
      const subtitle=opts.subtitle??(view==="cut"?`Corte real ${cutAxis.toUpperCase()}=${num(sectionPosition)} mm; símbolos indicam eixos, não seções fabricáveis.`:`Projeção de peças declaradas; referência de altura Z=${num(datum)} mm.`);
      book.text(space,[18,book.height-38],subtitle,"TEXTOS",2.3);
      const occupied:{x:number;y:number;width:number;height:number}[]=[];
      let dense=false;
      const label=(anchor:P,id:string,designation:string)=>{
        const value=`${id}: ${designation}`,full=cleanCadText(value).length<=90?value:`${id} (perfil: MATERIAIS)`;
        const lines=full.match(/.{1,65}/gu)??[""],w=Math.max(...lines.map(l=>l.length))*1.15,h=lines.length*2.8;
        let x=anchor[0]+1,y=anchor[1]+1,found=false;
        for(let i=0;i<400;i++){
          const column=Math.floor(i/100),offset=column%2?Math.ceil(column/2)*90:-Math.ceil(column/2)*90;
          x=Math.max(18,Math.min(book.width-18-w,anchor[0]+1+offset));
          y=Math.max(84+h,Math.min(book.height-56,anchor[1]+1+(i%2?-1:1)*Math.ceil((i%100)/2)*3));
          if(!occupied.some(b=>x<b.x+b.width+1&&x+w+1>b.x&&y-h<b.y+1&&y+1>b.y-b.height)){found=true;break;}
        }
        if(!found)dense=true;
        occupied.push({x,y,width:w,height:h});
        if(Math.hypot(x-anchor[0],y-anchor[1])>4)book.poly(space,[anchor,[x,y]],"MARCAS");
        lines.forEach((line,i)=>book.text(space,[x,y-i*2.8],line,"PERFIS",2));
      };
      const horizontalAxes=horizontal==="x"?xs:ys;
      const axisName=(axis:"x"|"y",value:number)=>axis==="x"?axisLetter(xs.indexOf(value)):String(ys.indexOf(value)+1);
      const bubble=(p:P,value:string)=>{
        space.addCircle(point3d(...p),3,{layerName:"EIXOS",lineType:"Continuous"});
        book.text(space,[p[0]-value.length*.7,p[1]-.9],value,"EIXOS",2.5);
      };
      for(const value of (view==="plan"?xs:horizontalAxes).filter(x=>x>=minX&&x<=maxX)){
        const q=at([value,minY]),end=at([value,maxY]);
        book.poly(space,[[q[0],q[1]-3],[end[0],end[1]+6]],"EIXOS");bubble([end[0],end[1]+9],axisName(view==="plan"?"x":horizontal,value));
      }
      const hv=(view==="plan"?xs:horizontalAxes).filter(x=>x>=minX&&x<=maxX);
      for(let i=1;i<hv.length;i++)book.dim(space,at([hv[i-1],minY]),at([hv[i],minY]),scale,`EIXOS ${axisName(view==="plan"?"x":horizontal,hv[i-1])}-${axisName(view==="plan"?"x":horizontal,hv[i])}`,-8);
      if(view==="plan"){
        for(const value of ys.filter(y=>y>=minY&&y<=maxY)){
          const a=at([minX,value]),b=at([maxX,value]);book.poly(space,[[a[0]-3,a[1]],[b[0]+3,b[1]]],"EIXOS");bubble([a[0]-7,a[1]],axisName("y",value));
        }
        const vv=ys.filter(y=>y>=minY&&y<=maxY);
        for(let i=1;i<vv.length;i++)book.dim(space,at([minX,vv[i-1]]),at([minX,vv[i]]),scale,`VÃO Y ${axisName("y",vv[i-1])}-${axisName("y",vv[i])}`,19);
        if(name==="PLANTA"){
          const a:P=cutAxis==="y"?[minX,sectionPosition]:[sectionPosition,minY],b:P=cutAxis==="y"?[maxX,sectionPosition]:[sectionPosition,maxY];
          book.poly(space,[at(a),at(b)],"EIXOS");book.text(space,at(a),"A-A","EIXOS");
        }
      }
      if(!opts.bases)for(const p of pieces){
        const a=nodes.get(p.start)!,b=nodes.get(p.end)!,ids=(opts.aliases?.get(p.id)??[p.id]).join(" / "),id=ids.length<=60?ids:`${p.id} (*)`;
        const layer=isDeclaredBrace(p)?"CONTRAVENTOS":p.role==="web"&&name==="TERCAS E CONTRAVENTOS"?"BARRAS_AUXILIARES":"PERFIS";
        if(view==="cut"&&!(a[cutAxis]===sectionPosition&&b[cutAxis]===sectionPosition)){
          const c=cross(p);if(c){const q=at(c);space.addCircle(point3d(...q),.7,{layerName:layer});label(q,id,profile(p.id));}continue;
        }
        const u=at(projection(a)),v=at(projection(b));book.poly(space,[u,v],layer);label([(u[0]+v[0])/2,(u[1]+v[1])/2],id,profile(p.id));
      }
      if(showRoof&&!opts.bases)for(const face of faces){
        if(view==="cut"){
          const intersections:P[]=[];
          for(const ring of [face.outer,...face.holes])for(let i=1;i<ring.length;i++){
            const av=ring[i-1],bv=ring[i],a={x:av[0],y:av[1],z:av[2]},b={x:bv[0],y:bv[1],z:bv[2]};
            if(a[cutAxis]===sectionPosition&&b[cutAxis]===sectionPosition)book.poly(space,[at(projection(a)),at(projection(b))],"COBERTURA");
            else if((a[cutAxis]<=sectionPosition&&b[cutAxis]>sectionPosition)||(b[cutAxis]<=sectionPosition&&a[cutAxis]>sectionPosition)){
              const t=(sectionPosition-a[cutAxis])/(b[cutAxis]-a[cutAxis]);intersections.push([a[horizontal]+t*(b[horizontal]-a[horizontal]),a.z+t*(b.z-a.z)]);
            }
          }
          intersections.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
          for(let i=1;i<intersections.length;i+=2)book.poly(space,[at(intersections[i-1]),at(intersections[i])],"COBERTURA");
        }else for(const ring of [face.outer,...face.holes])book.poly(space,ring.map(([x,y,z])=>at(projection({x,y,z}))),"COBERTURA");
      }
      for(const n of supports){
        if(opts.frame&&!pieces.some(p=>p.start===n.id||p.end===n.id))continue;
        if(view==="cut"&&n[cutAxis]!==sectionPosition)continue;
        const q=at(projection(n));book.poly(space,[[q[0],q[1]],[q[0]-1.5,q[1]-2],[q[0]+1.5,q[1]-2],[q[0],q[1]]],"APOIOS");
        book.text(space,[q[0]+2,q[1]-3],`APOIO ${n.id}`,"APOIOS",2);
      }
      if(width>0)book.dim(space,at([minX,minY]),at([maxX,minY]),scale,"EXTENSÃO",-20);
      if(view!=="plan"){
        const levels=showRoof?unique(roof.map(n=>n.z)):unique(points.map(n=>n.z));
        for(const [i,z] of levels.filter(z=>z!==datum).entries())book.dim(space,at([minX,datum]),at([minX,z]),scale,showRoof?(ridge.includes(z)?"CUMEEIRA":"BORDA/BEIRAL"):"NÍVEL",10+i*9);
        if(showRoof&&!roof.length)book.text(space,[18,78],"PENDENTE: cobertura física não declarada; alturas de beiral/cumeeira não inferidas.","TEXTOS",2.2);
      }
      if(view==="cut"){
        if(distinct.length<=12)for(let i=1;i<distinct.length;i++)book.dim(space,at(distinct[i-1]),at(distinct[i]),scale,"EIXOS TERÇAS",5);
        else book.dim(space,at(distinct[0]),at(distinct.at(-1)!),scale,"TERÇAS: ver ESPACAMENTOS",5);
        if(distinct.length<2)book.text(space,[18,78],"PENDENTE: sequência de eixos de terças não identificada neste corte.","TEXTOS",2.2);
      }
      if(name==="TERCAS E CONTRAVENTOS"){
        const values=unique(distinct.map(p=>p[0]));
        const marked=values.length<=12?values:[values[0],values.at(-1)!];
        for(let i=1;i<marked.length;i++){
          const a:P=cutAxis==="y"?[marked[i-1],minY]:[minX,marked[i-1]],b:P=cutAxis==="y"?[marked[i],minY]:[minX,marked[i]];
          book.dim(space,at(a),at(b),scale,values.length<=12?"TERÇAS PROJ.":"TERÇAS: ver ESPACAMENTOS",-13);
        }
        if(!model.pieces.some(isDeclaredBrace))book.text(space,[18,78],"PENDENTE: contraventamentos sem identificação explícita em label/grupo; web auxiliar não implica contenção.","TEXTOS",2.2);
      }
      if(opts.bases){
        book.text(space,[18,book.height-47],"PENDENTE DE PROJETO — BASES E CHUMBADORES (A4/A5)","REACOES",3);
        book.text(space,[18,78],"Símbolos indicam nós; chapa, furos, chumbadores e soldas não dimensionados. Ver tabelas de posições e reações.","TEXTOS",2.2);
      }
      if(!supports.length)book.text(space,[18,83],"PENDENTE: apoios não declarados; nenhum apoio foi criado.","TEXTOS",2.2);
      if(dense)book.text(space,[18,book.height-47],"PENDENTE: etiquetas densas; conferir identificação completa nas folhas de materiais.","TEXTOS",2.3);
    });
  }
  drawing("PLANTA","plan");drawing("FRONTAL","front");drawing("LATERAL","side");drawing("CORTE A-A","cut");
  const auxiliaries=model.pieces.filter(p=>p.role==="purlin"||isDeclaredBrace(p)||(p.role==="web"&&!data.frames.some(f=>f.pieces.includes(p))));
  drawing("TERCAS E CONTRAVENTOS","plan",{pieces:auxiliaries.length?auxiliaries:model.pieces,
    subtitle:"IDs vinculados à lista de materiais; espaçamentos projetados. Contraventamentos apenas quando identificados no modelo."});
  if(distinct.length>=2){
    const ids=(point:P)=>purlins.filter(p=>{const c=cross(p);return c&&c[0]===point[0]&&c[1]===point[1];}).map(p=>p.id).join(" / ");
    book.table("ESPACAMENTOS TERCAS",["PEÇAS / EIXOS","POS. 1 (mm)","POS. 2 (mm)","PROJ. (mm)","CORTE (mm)"],distinct.slice(1).map((b,i)=>{
      const a=distinct[i];return [`${ids(a)} -> ${ids(b)}`,`${num(a[0])} / Z=${num(a[1])}`,`${num(b[0])} / Z=${num(b[1])}`,num(b[0]-a[0]),num(Math.hypot(b[0]-a[0],b[1]-a[1]))];
    }),[0,.3,.5,.7,.83,1],"MATERIAIS",`${cutAxis.toUpperCase()}=${num(sectionPosition)} mm · distâncias entre eixos reais no corte, sem hipótese de faixa tributária.`);
  }
  for(const [index,group] of data.frameGroups.entries()){
    const first=group[0],h=first.axis==="y"?"x":"y";
    const token=(frame:typeof first,p:CadPiece)=>{
      const min=Math.min(...frame.pieces.flatMap(p=>[nodes.get(p.start)![h],nodes.get(p.end)![h]])),a=nodes.get(p.start)!,b=nodes.get(p.end)!;
      return JSON.stringify([a[h]-min,a.z,b[h]-min,b.z,p.role,profile(p.id)]);
    };
    const aliases=new Map(first.pieces.map(p=>[p.id,group.flatMap(f=>f.pieces.filter(q=>token(f,q)===token(first,p)).map(q=>q.id))]));
    const locations=group.map(f=>{
      const positions=f.pieces.flatMap(p=>[nodes.get(p.start)![h],nodes.get(p.end)![h]]);
      return `${f.axis.toUpperCase()}=${num(f.coordinate)} mm (eixo ${f.axis==="y"?ys.indexOf(f.coordinate)+1:axisLetter(xs.indexOf(f.coordinate))}); ${h.toUpperCase()}=${num(Math.min(...positions))}..${num(Math.max(...positions))} mm`;
    });
    drawing(`${first.kind} ${index+1}`,first.axis==="y"?"front":"side",{pieces:first.pieces,showRoof:false,frame:true,aliases,
      subtitle:`${group.length}× ${first.kind}: posições e IDs equivalentes (*) nas folhas IDENTIFICACAO ${first.kind} ${index+1}.`});
    book.notes(`IDENTIFICACAO ${first.kind} ${index+1}`,[`${group.length}× — LOCAÇÃO:`,...locations,
      "Agrupamento gráfico por geometria orientada, perfil/material, vínculos declarados e apoios iguais. Cargas e aprovação não são equiparadas.",
      ...first.pieces.map(p=>`${p.id} => ${(aliases.get(p.id)??[]).join(" / ")} | ${profile(p.id)}`)]);
  }
  if(!data.frameGroups.length)book.notes("PORTICOS PENDENTE",["PENDENTE: conjunto de pórtico/tesoura não identificado em planos globais X/Y com conectividade declarada.","Nenhuma tesoura, pilar ou vínculo foi inferido. Peças permanecem nas vistas gerais e na lista de materiais."]);
  drawing("BASES E CHUMBADORES","plan",{pieces:[],showRoof:false,bases:true,subtitle:"Locação de apoios declarados — coordenadas em mm; não representa geometria de chapa ou fundação."});
  book.table("BASES POSICOES",["NÓ","EIXOS","X / Y / Z (mm)","DOFs / TIPO"],supports.map(n=>{
    const support=draft!.supports.find(s=>s.nodeId===n.id)!,face=draft?.supportInterfaces?.find(f=>f.nodeId===n.id);
    const dofs=support.dofs.map(d=>d==="fixed"?"fixo":d==="free"?"livre":"PENDENTE").join(" / ");
    return [n.id,data.location(n),`${num(n.x)} / ${num(n.y)} / ${num(n.z)}`,`${dofs} · ${face?.kind??"PENDENTE"}`];
  }),[0,.14,.3,.64,1],"APOIOS","PENDENTE DE PROJETO (A4/A5): nenhuma chapa, furação, solda ou resistência foi presumida.");
  const reactions=cadReactions(project,options.reactions);
  if(reactions.data)book.table("REACOES",["NÓ","COMB.","Fx (kN)","Fy (kN)","Fz (kN)","Mx (kNm)","My (kNm)","Mz (kNm)"],reactions.data.rows.map(r=>[
    r.nodeId,r.combinationId,...r.force.map(n=>num(n/1000)),...r.moment.map(n=>num(n/1000))]),[0,.08,.28,.4,.52,.64,.76,.88,1],"REACOES",
    "PENDENTE DE PROJETO (A4/A5) · reações concomitantes por combinação, eixos globais; não são capacidades.");
  book.notes("RASTREIO REACOES",[reactions.status,"PENDENTE DE PROJETO (A4/A5). Revisão profissional, ancoragem, chapa, furos, soldas, contato e fundação não verificados."]);
  const references=new Set<string>();
  const reference=(r:{standard:string;edition:string;clause:string;source:string;revision:string})=>references.add(`${r.standard} · edição ${r.edition} · item ${r.clause} · fonte ${r.source} · revisão ${r.revision}`);
  for(const c of draft?.engineeringCombinations?.combinations??[])for(const r of [c.reference,...c.terms.map(t=>t.reference)])reference(r);
  for(const a of draft?.engineeringCombinations?.actions??[])reference(a.reference);
  const wind=draft?.loading?.wind;
  if(wind){
    reference(wind.building.reference);reference(wind.building.velocityReference);
    for(const c of wind.cases){reference(c.reference);for(const z of c.zones)reference(z.reference);}
  }
  for(const p of draft?.normativeProvenance??[])references.add(`PROVISÓRIO — ${p.standard} · edição ${p.edition} · origem ${p.origin} · ${p.reason}`);
  for(const c of draft?.loading?.facadeTraction?.cases??[])references.add(`Pressões de fachada: fonte declarada ${c.reference}; norma/edição não inferida desse texto.`);
  for(const s of draft?.resistanceStandards??[])references.add(`${s.standard}: peça ${s.pieceId}; edição e aplicação integral PENDENTE.`);
  const materials=new Map<string,string>(),sections=new Map<string,string>();
  for(const piece of model.pieces){
    const a=draft?.physicalCatalog?.assignments.find(a=>a.pieceId===piece.id),m=draft?.physicalCatalog?.materials.find(m=>m.id===a?.materialId),g=draft?.groups[piece.role];
    const key=m?.id??`grupo ${piece.role}`,value=m??g;
    materials.set(key,`${key}: aço ${value?.steelGrade?.trim()||"PENDENTE"} · fonte ${value?.materialSource?.trim()||"PENDENTE"} · revisão ${value?.materialRevision?.trim()||"PENDENTE"}`);
    const section=draft?.physicalCatalog?.sections.find(s=>s.id===a?.sectionId),sectionKey=section?.id??`grupo ${piece.role}`,s=section??g;
    sections.set(sectionKey,`${sectionKey}: fonte ${s?.sectionSource?.trim()||"PENDENTE"} · revisão ${s?.sectionRevision?.trim()||"PENDENTE"}`);
  }
  book.notes("NOTAS GERAIS",[CAD_NOTICE,`Obra: ${project.name} · revisão física ${model.revision} · fonte ${model.provenance}`,
    "Unidades: geometria/cotas em mm; massas em kg; reações em kN e kNm. Eixos globais X/Y; Z para cima.",
    "Eixos de locação derivados de apoios, pilares e planos identificados; não criam vínculos ou dimensões físicas novas.",
    "IDs originais ligam vistas, agrupamentos e lista de materiais. Comprimentos entre nós, sem descontos de fabricação.",
    "REFERÊNCIAS DECLARADAS — não atestam aplicação integral, edição vigente, revisão profissional ou homologação:",
    ...(references.size?[...references]:["PENDENTE: normas e edições não declaradas no modelo."]),"AÇO E PROVENIÊNCIA:",...materials.values(),"PERFIS E PROVENIÊNCIA:",...sections.values(),
    "PENDENTE DE PROJETO: detalhamento de bases, chumbadores, chapas, furos, ligações e soldas (A4/A5).",
    "Responsável técnico, CREA e ART devem ser preenchidos pelo profissional responsável, após conferência; campos em branco não autorizam execução.",
    "Análise experimental, revisão normativa, responsabilidade técnica e liberação de fabricação são estados separados. Bloqueios atuais preservados."]);
  book.table("MATERIAIS",["PEÇA","PERFIL DECLARADO","QTD","COMP. (mm)","PESO (kg/m)","PESO (kg)"],takeoff.pieces.map(p=>[
    p.pieceId,profile(p.pieceId),"1",num(p.lengthMm),p.massKg===null?"PENDENTE":num(p.massKg/(p.lengthMm/1000)),p.massKg===null?"PENDENTE":num(p.massKg)]),
    [0,.09,.42,.47,.62,.79,1],"MATERIAIS",`TOTAL: ${takeoff.totals.quantity} peças · ${num(takeoff.totals.lengthM*1000)} mm · ${takeoff.totals.massKg===null?"PESO PENDENTE":num(takeoff.totals.massKg)+" kg"}`);
  book.render();
}
