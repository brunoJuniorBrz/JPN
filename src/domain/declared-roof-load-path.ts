import type {Project} from "./models";
import type {RoofAreaAction} from "./roof-load-path";
import type {PhysicalGeometry} from "./structure";
import {structureSignature} from "./calculations/project-basis";
import {resolvePhysicalStructure} from "./physical-structure";
import {auditPhysicalRoofCoverage} from "./physical-roof-coverage";
import {orthogonalRoofCells} from "./orthogonal-roof-cells";
import {roofDistributionSchema,roofRegionsSchema,type RoofRegion} from "./roof-regions";

/** Restricted but REAL load path for declared physical roof faces. Supports
 * orthogonal planar polygons and holes ONLY where every rectangular cell has
 * two existing segmented purlin edges; no guessing a tributary load path.
 * The independently audited physical model supplies every node/member. */
type V=[number,number,number];
const eps=1e-7;
const add=(a:V,b:V)=>a.forEach((_,i)=>a[i]+=b[i]);
const scale=(v:V,s:number):V=>[v[0]*s,v[1]*s,v[2]*s];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(message:string):never=>{throw new Error("M39_DECLARED_ROOF: "+message);};
type RowPiece={id:string;at:number;lo:number;hi:number;start:V;end:V;lengthM:number};
type Surface={region:RoofRegion;u:number;v:number;rows:{at:number;pieces:RowPiece[]}[]};
const near=(a:number,b:number)=>Math.abs(a-b)<=eps;
/** A reviewed tributary declaration must bind BOTH the steel model and the
 * roof sheeting contours. Updating a cutout, face or ownership invalidates it. */
export function declaredRoofDistributionSignature(project:Project){
  const faces=project.workspace.spatialPreparation?.physicalRoofFaces;
  if(!project.workspace.physicalStructure||!faces)
    fail("PHYSICAL_ROOF_PENDING: assinatura exige estrutura e faces declaradas");
  return JSON.stringify({physicalStructureSignature:structureSignature(project),roofFaces:faces});
}

/** The 3D members are projected into metres ONLY after geometrical auditing.
 * Every supported surface is an explicit rectangle, not an inferred hull. */
function supportedSurfaces(model:PhysicalGeometry,project:Project):Surface[]{
  const declared=project.workspace.spatialPreparation?.physicalRoofFaces;
  if(!declared)fail("PHYSICAL_ROOF_PENDING: declare as superfícies em XYZ e suas terças");
  const audit=auditPhysicalRoofCoverage(declared,model);
  const points=new Map(model.nodes.map(p=>[p.id,[p.x/1000,p.y/1000,p.z/1000] as V]));
  const pieces=new Map(model.pieces.map(p=>[p.id,p]));
  return audit.geometry.faces.flatMap((face,i)=>{
    const plane=audit.faces[i].plane;
    const first=pieces.get(face.supportPieceIds[0])!;
    const a=points.get(first.start)!,b=points.get(first.end)!;
    const dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
    if(!(dx<=eps&&dy>eps)&&!(dy<=eps&&dx>eps))
      fail("PURLIN_ORIENTATION_UNSUPPORTED: terças precisam ser paralelas a um dos eixos horizontais");
    const u=dx<=eps?0:1,v=u===0?1:0;
    const dzLong=u===0?plane.dzDy:plane.dzDx;
    if(Math.abs(dzLong)>1e-9)
      fail("LONGITUDINAL_SLOPE_PENDING: terças inclinadas longitudinalmente exigem integração por comprimento real");
    const cells=orthogonalRoofCells(face,model,u,i,audit.faces[i].horizontalAreaM2);
    return cells.map(cell=>{
      const bounds=cell.boundsM;
      const z0=(plane.originMm[2]+(bounds[0]*1000-plane.originMm[0])*plane.dzDx+
        (bounds[1]*1000-plane.originMm[1])*plane.dzDy)/1000;
      const region:RoofRegion={id:cell.id,boundsM:bounds,
        plane:{z0M:z0,dzDx:plane.dzDx,dzDy:plane.dzDy},
        purlinPieceIds:cell.purlinPieceIds,source:face.source,revision:face.revision};
      const rows:{at:number;pieces:RowPiece[]}[]=[];
      for(const id of cell.purlinPieceIds){
        const member=pieces.get(id)!,start=points.get(member.start)!,end=points.get(member.end)!;
        if(Math.abs(start[u]-end[u])>eps||Math.abs(start[2]-end[2])>eps)
          fail("NONPARALLEL_PURLIN: membro declarado não tem trecho longitudinal horizontal constante");
        const at=start[u],lo=Math.min(start[v],end[v]),hi=Math.max(start[v],end[v]);
        if(at<bounds[u]-eps||at>bounds[u+2]+eps||lo<bounds[v]-eps||hi>bounds[v+2]+eps)
          fail("PURLIN_BOUNDARY: terça fora dos limites da célula física");
        const lengthM=Math.hypot(...end.map((x,j)=>x-start[j]));
        if(Math.abs(lengthM-(hi-lo))>eps||lengthM<=eps)
          fail("PURLIN_LENGTH: comprimento físico incompatível com faixa longitudinal suportada");
        let row=rows.find(r=>near(r.at,at));
        if(!row){row={at,pieces:[]};rows.push(row);}
        row.pieces.push({id,at,lo,hi,start,end,lengthM});
      }
      rows.sort((a,b)=>a.at-b.at);
      if(rows.length!==2||!near(rows[0].at,bounds[u])||!near(rows[1].at,bounds[u+2]))
        fail("PURLIN_BOUNDARY_ROWS: duas bordas exigem terças físicas explícitas");
      for(const row of rows){
        if(row.pieces.length!==1||!near(row.pieces[0].lo,bounds[v])||
          !near(row.pieces[0].hi,bounds[v+2]))
          fail("PURLIN_GAP: toda a célula precisa da terça real correspondente");
      }
      return {region,u,v,rows};
    });
  });
}
export function distributeDeclaredRoofActions(project:Project,actions:RoofAreaAction[],declaration:unknown){
  if(!project.workspace.physicalStructure)fail("DECLARATION_REQUIRED: exige geometria física declarada");
  if(actions.length>10)fail("ACTION_LIMIT: máximo dez ações de superfície");
  const method=roofDistributionSchema.parse(declaration);
  if(method.geometrySignature!==declaredRoofDistributionSignature(project))fail("STALE_DISTRIBUTION: estrutura, panos ou terças mudaram; revise a transmissão");
  const model=resolvePhysicalStructure(project).model??fail("GEOMETRY_PENDING: geometria declarada inválida");
  if(model.nodes.length>250||model.pieces.length>600)fail("MODEL_LIMIT: topologia excede os limites do adaptador");
  const surfaces=supportedSurfaces(model,project);
  const regions=roofRegionsSchema.parse({schema_version:"jpn.roof-regions/1",
    units:"m",footprintM:surfaces.map(s=>s.region.boundsM),regions:surfaces.map(s=>s.region)});
  const trace=actions.map((action,ai)=>{
    if(!Number.isFinite(action.knM2)||action.knM2<0||action.direction.some(v=>!Number.isFinite(v))||
      Math.abs(Math.hypot(...action.direction)-1)>1e-10||
      !action.source.trim()||!action.revision.trim()||!action.loadPath.trim()||
      !["horizontal","roof-surface"].includes(action.projection))
      fail("ACTION_INVALID: intensidade, vetor unitário, base e referências obrigatórios");
    let areaM2=0,distributedAreaM2=0;
    const expectedForce:V=[0,0,0],expectedMoment:V=[0,0,0];
    const distributedForce:V=[0,0,0],distributedMoment:V=[0,0,0];
    const contributions:{regionId:string;pieceId:string;stripM:[number,number];widthProjectedM:number;
      effectiveAreaM2:number;forcePerLengthNM:V;forceN:V;momentNm:V}[]=[];
    for(const surface of surfaces){
      const {region:r,u,v,rows}=surface,b=r.boundsM,spanV=b[v+2]-b[v];
      const factor=action.projection==="roof-surface"?Math.hypot(1,r.plane.dzDx,r.plane.dzDy):1;
      const area=(b[u+2]-b[u])*spanV*factor;areaM2+=area;
      const center:V=[(b[0]+b[2])/2,(b[1]+b[3])/2,
        r.plane.z0M+r.plane.dzDx*(b[2]-b[0])/2+r.plane.dzDy*(b[3]-b[1])/2];
      const expected=scale(action.direction,1000*action.knM2*area);
      add(expectedForce,expected);add(expectedMoment,cross(center,expected));
      for(let k=0;k<rows.length;k++){
        const row=rows[k],left=k?(rows[k-1].at+row.at)/2:b[u],
          right=k+1<rows.length?(row.at+rows[k+1].at)/2:b[u+2],width=right-left;
        if(width<=0)fail("TRIBUTARY_WIDTH: área tributária inválida");
        for(const p of row.pieces){
          const effectiveAreaM2=width*factor*p.lengthM;
          const q=scale(action.direction,1000*action.knM2*width*factor);
          const force=scale(q,p.lengthM),mid=scale([p.start[0]+p.end[0],p.start[1]+p.end[1],p.start[2]+p.end[2]],.5);
          const moment=cross(mid,force);
          contributions.push({regionId:r.id,pieceId:p.id,stripM:[left,right],widthProjectedM:width,effectiveAreaM2,
            forcePerLengthNM:q,forceN:force,momentNm:moment});
          distributedAreaM2+=effectiveAreaM2;add(distributedForce,force);add(distributedMoment,moment);
        }
      }
    }
    const mag=Math.max(1,action.knM2*1000*areaM2),
      arm=Math.max(1,...model.nodes.flatMap(n=>[Math.abs(n.x),Math.abs(n.y),Math.abs(n.z)]))/1000;
    if(![areaM2,distributedAreaM2,...expectedForce,...expectedMoment,...distributedForce,...distributedMoment].every(Number.isFinite)||
      Math.abs(areaM2-distributedAreaM2)>1e-10*Math.max(1,areaM2)||
      expectedForce.some((x,i)=>Math.abs(x-distributedForce[i])>1e-10*mag)||
      expectedMoment.some((x,i)=>Math.abs(x-distributedMoment[i])>1e-10*mag*Math.max(1,arm)))
      fail("CONSERVATION: resultantes, áreas ou momentos não conservados, carga bloqueada");
    const loads=new Map<string,V>();
    for(const c of contributions){
      const q=loads.get(c.pieceId)??[0,0,0] as V;
      add(q,c.forcePerLengthNM);loads.set(c.pieceId,q);
    }
    return {actionId:"AREA-"+(ai+1),action,areaM2,distributedAreaM2,
      expectedForceN:expectedForce,distributedForceN:distributedForce,
      expectedMomentNm:expectedMoment,distributedMomentNm:distributedMoment,
      contributions,loads:[...loads].map(([pieceId,forcePerLengthNM])=>({pieceId,forcePerLengthNM}))};
  });
  return {schema_version:"jpn.roof-load-path/1" as const,units:"SI" as const,method,regions,actions:trace,
    declaredGeometry:true as const,computedStructuralApproval:false as const,fabricationRelease:false as const};
}
