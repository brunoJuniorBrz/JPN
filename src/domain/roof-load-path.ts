import type { Project } from "./models";
import type { StructureModel } from "./structure";
import { generateStructure } from "./calculations/structure";
import { assertGeneratedPhysicalStructure } from "./physical-structure";
import { structureSignature } from "./calculations/project-basis";
import { roofDistributionSchema,roofRegionsSchema,regionElevation,roofGeometryToleranceM as eps,type RoofRegion } from "./roof-regions";

type V=[number,number,number];
export interface RoofAreaAction {caseId:string;knM2:number;projection:"horizontal"|"roof-surface";direction:V;source:string;revision:string;loadPath:string;}
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a:V,s:number)=>a.map(v=>v*s) as V;
const add=(a:V,b:V)=>a.forEach((v,i)=>a[i]=v+b[i]);
function fail(message:string):never {throw new Error(message);}
function positions(model:StructureModel){return new Map(model.nodes.map(n=>[n.id,[n.x/1000,n.y/1000,n.z/1000] as V]));}

/** These are the actual legacy generator surfaces, including longitudinal
 * overhangs. No structural supports or section properties are inferred. */
export function generatedRoofRegions(project:Project,model?:StructureModel|null){
  assertGeneratedPhysicalStructure(project,"regiões e cargas de cobertura");
  if(model===undefined)model=generateStructure(project).model;
  if(!model||!project.planning||project.roof.widthM===null||project.roof.lengthM===null)fail("ROOF_GEOMETRY_PENDING: geometria incompleta.");
  const across=project.roof.fall.startsWith("width"),u=across?0:1;
  const points=positions(model),purlins=model.pieces.filter(p=>p.role==="purlin");
  if(!purlins.length)fail("ROOF_GEOMETRY_PENDING: nenhuma terça.");
  const span=across?project.roof.widthM:project.roof.lengthM,length=across?project.roof.lengthM:project.roof.widthM;
  const low=-(project.planning.overhangStartM??fail("Balanço inicial pendente.")),high=length+(project.planning.overhangEndM??fail("Balanço final pendente."));
  const z=(at:number)=>{const p=purlins.find(p=>Math.abs(points.get(p.start)![u]-at)<=eps);return p?points.get(p.start)![2]:fail("ROOF_BOUNDARY_ROW: falta terça no limite da superfície.");};
  const cuts=project.planning.typology==="gable"?[0,span/2,span]:[0,span];
  const bounds=(a:number,b:number):[number,number,number,number]=>across?[a,low,b,high]:[low,a,high,b];
  const regions:RoofRegion[]=cuts.slice(0,-1).map((a,i)=>{const b=cuts[i+1],gradient=(z(b)-z(a))/(b-a);return {
    id:`roof-${i+1}`,boundsM:bounds(a,b),plane:{z0M:z(a),dzDx:across?gradient:0,dzDy:across?0:gradient},
    purlinPieceIds:purlins.filter(p=>{const at=points.get(p.start)![u];return at>=a-eps&&at<=b+eps;}).map(p=>p.id),
    source:"Superfície do gerador JPN, entre eixos das terças extremas",revision:"generator-regions/1",
  };});
  return roofRegionsSchema.parse({schema_version:"jpn.roof-regions/1",units:"m",footprintM:[bounds(0,span)],regions});
}

export function distributeRoofActions(project:Project,actions:RoofAreaAction[],declaration:unknown){
  assertGeneratedPhysicalStructure(project,"distribuição de cargas de cobertura");
  if(actions.length>10)fail("ROOF_MODEL_LIMIT: mais de dez ações de área.");
  const method=roofDistributionSchema.safeParse(declaration);
  if(!method.success)fail("ROOF_LOAD_PATH_PENDING: declare a distribuição por faixas tributárias antes de calcular.");
  if(method.data.geometrySignature!==structureSignature(project))fail("STALE_ROOF_LOAD_PATH: geometria/perfis mudaram; refaça a associação.");
  if(project.workspace.spatialPreparation?.roofRegions)fail("COMPOSED_ROOF_PRELIMINARY: regiões compostas ainda não analisáveis.");
  const model=generateStructure(project).model??fail("ROOF_GEOMETRY_PENDING: geometria incompleta."),surfaces=generatedRoofRegions(project,model);
  if(model.nodes.length>250||model.pieces.length>600)fail("ROOF_MODEL_LIMIT: geometria excede o adaptador físico existente.");
  const points=positions(model),pieces=new Map(model.pieces.map(p=>[p.id,p])),u=project.roof.fall.startsWith("width")?0:1,v=u===0?1:0;
  const trace=actions.map((action,ai)=>{
    if(!Number.isFinite(action.knM2)||action.knM2<0||action.direction.some(x=>!Number.isFinite(x))||Math.abs(Math.hypot(...action.direction)-1)>1e-10||!action.source.trim()||!action.revision.trim()||!action.loadPath.trim())fail("ROOF_ACTION_INVALID: declare intensidade, vetor unitário, origem, revisão e caminho de carga.");
    if(!["horizontal","roof-surface"].includes(action.projection))fail("ROOF_ACTION_INVALID: projeção não declarada.");
    const expectedForce:V=[0,0,0],expectedMoment:V=[0,0,0],distributedForce:V=[0,0,0],distributedMoment:V=[0,0,0];
    const contributions:{regionId:string;pieceId:string;stripM:[number,number];widthProjectedM:number;effectiveAreaM2:number;forcePerLengthNM:V;forceN:V;momentNm:V}[]=[];
    let areaM2=0,distributedAreaM2=0;
    for(const region of surfaces.regions){
      const r=region.boundsM,start=r[u],end=r[u+2],v0=r[v],v1=r[v+2];
      const factor=action.projection==="horizontal"?1:Math.hypot(1,region.plane.dzDx,region.plane.dzDy);
      const area=(end-start)*(v1-v0)*factor;areaM2+=area;
      const centroid:V=[(r[0]+r[2])/2,(r[1]+r[3])/2,regionElevation(region,(r[0]+r[2])/2,(r[1]+r[3])/2)];
      const force=scale(action.direction,action.knM2*1000*area);add(expectedForce,force);add(expectedMoment,cross(centroid,force));
      const rows:{at:number;pieces:typeof model.pieces}[]=[];
      for(const id of region.purlinPieceIds){
        const p=pieces.get(id)??fail("ROOF_ORPHAN_PIECE: terça inexistente."),a=points.get(p.start)!,b=points.get(p.end)!;
        if(p.role!=="purlin"||Math.abs(a[u]-b[u])>eps||Math.abs(a[2]-regionElevation(region,a[0],a[1]))>eps||Math.abs(b[2]-regionElevation(region,b[0],b[1]))>eps)fail("ROOF_NONPARALLEL: terças não pertencem ao plano/faixas suportadas.");
        let row=rows.find(row=>Math.abs(row.at-a[u])<=eps);if(!row){row={at:a[u],pieces:[]};rows.push(row);}row.pieces.push(p);
      }
      rows.sort((a,b)=>a.at-b.at);
      if(rows.length<2||Math.abs(rows[0].at-start)>eps||Math.abs(rows.at(-1)!.at-end)>eps)fail("ROOF_BOUNDARY_ROW: as bordas precisam coincidir com terças; balanços transversais não suportados.");
      for(let i=0;i<rows.length;i++){
        const row=rows[i],left=i?(rows[i-1].at+row.at)/2:start,right=i+1<rows.length?(row.at+rows[i+1].at)/2:end,width=right-left;
        const intervals=row.pieces.map(p=>({p,a:Math.min(points.get(p.start)![v],points.get(p.end)![v]),b:Math.max(points.get(p.start)![v],points.get(p.end)![v])})).sort((a,b)=>a.a-b.a);
        let cursor=v0;
        for(const interval of intervals){
          if(Math.abs(interval.a-cursor)>eps||interval.b>v1+eps||interval.b-interval.a<=eps)fail("ROOF_PURLIN_COVERAGE: lacuna, sobreposição ou comprimento incompatível em uma linha de terças.");
          cursor=interval.b;
          const a=points.get(interval.p.start)!,b=points.get(interval.p.end)!,length=Math.hypot(...b.map((x,j)=>x-a[j]));
          if(Math.abs(length-(interval.b-interval.a))>eps)fail("ROOF_NONPARALLEL: terça inclinada longitudinalmente não suportada.");
          const effectiveAreaM2=width*factor*length,q=scale(action.direction,action.knM2*1000*width*factor),f=scale(q,length),mid=a.map((x,j)=>(x+b[j])/2) as V,moment=cross(mid,f);
          contributions.push({regionId:region.id,pieceId:interval.p.id,stripM:[left,right],widthProjectedM:width,effectiveAreaM2,forcePerLengthNM:q,forceN:f,momentNm:moment});
          distributedAreaM2+=effectiveAreaM2;add(distributedForce,f);add(distributedMoment,moment);
        }
        if(Math.abs(cursor-v1)>eps)fail("ROOF_PURLIN_COVERAGE: linha de terças incompleta.");
      }
    }
    const forceScale=Math.max(1,Math.abs(action.knM2*1000*areaM2)),arm=Math.max(1,...[...points.values()].flatMap(p=>p.map(Math.abs)));
    if(![areaM2,distributedAreaM2,forceScale,...expectedForce,...distributedForce,...expectedMoment,...distributedMoment].every(Number.isFinite))fail("ROOF_CONSERVATION: limite numérico excedido.");
    if(Math.abs(areaM2-distributedAreaM2)>1e-10*Math.max(1,areaM2)||expectedForce.some((x,i)=>Math.abs(x-distributedForce[i])>1e-10*forceScale)||expectedMoment.some((x,i)=>Math.abs(x-distributedMoment[i])>1e-10*forceScale*arm))fail("ROOF_CONSERVATION: área, resultante ou momento global não conservado; análise bloqueada.");
    // A ridge receives the sum of its two disjoint half-strips, in one load.
    const loads=new Map<string,V>();for(const c of contributions){const q=loads.get(c.pieceId)??[0,0,0];add(q,c.forcePerLengthNM);loads.set(c.pieceId,q);}
    return {actionId:`AREA-${ai+1}`,action,areaM2,distributedAreaM2,expectedForceN:expectedForce,distributedForceN:distributedForce,expectedMomentNm:expectedMoment,distributedMomentNm:distributedMoment,contributions,
      loads:[...loads].map(([pieceId,forcePerLengthNM])=>({pieceId,forcePerLengthNM}))};
  });
  return {schema_version:"jpn.roof-load-path/1" as const,units:"SI" as const,method:method.data,regions:surfaces,actions:trace};
}
