import type {Project} from "@/domain/models";
import {packageTakeoff} from "./package-source";

export const DIMENSION_CONFLICT_TOLERANCE_MM=2;
export function reviewSourceDimensions(project:Project){
  const pieces=new Map(packageTakeoff(project).pieces.map(p=>[p.pieceId,p]));
  return (project.workspace.dimensionalChecks??[]).map(c=>{
    const piece=pieces.get(c.pieceId),actualMm=piece?.lengthMm??null,
      discrepancyMm=actualMm===null?null:actualMm-c.statedLengthMm;
    return {pieceId:c.pieceId,actualMm,declaredMm:c.statedLengthMm,discrepancyMm,
      status:actualMm===null||Math.abs(discrepancyMm!)>DIMENSION_CONFLICT_TOLERANCE_MM?"PENDENTE" as const:"CONFERIDO" as const,
      source:c.source,revision:c.revision,note:c.note};
  });
}

/** An overall quoted dimension can differ from the schematic roof envelope.
 * Prefer reporting that fact over deforming a declared roof face to match it. */
export function reviewRoofEnvelope(project:Project){
  const vertices=project.workspace.spatialPreparation?.physicalRoofFaces?.faces.flatMap(f=>f.outer)??[];
  return (project.workspace.overallDimensionChecks??[]).map(c=>{
    const k=c.axis==="x"?0:1;
    const actualMm=vertices.length?Math.max(...vertices.map(v=>v[k]))-Math.min(...vertices.map(v=>v[k])):null;
    const discrepancyMm=actualMm===null?null:actualMm-c.statedLengthMm;
    return {...c,actualMm,discrepancyMm,
      status:discrepancyMm===null||Math.abs(discrepancyMm)>DIMENSION_CONFLICT_TOLERANCE_MM?"PENDENTE" as const:"CONFERIDO" as const};
  });
}
/** Detect face/top-chord pitch mismatch from shared XYZ position. Proximity in
 * a drawing is NOT evidence of a welded or bolted structural connection. */
export function reviewRoofSlope(project:Project){
  const model=project.workspace.physicalStructure,faces=project.workspace.spatialPreparation?.physicalRoofFaces?.faces??[];
  if(!model||!faces.length)return [];
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const nearEdge=(p:{x:number;y:number},outer:[number,number,number][])=>outer.some((v,i)=>{
    if(i===0)return false;
    const u=outer[i-1],dx=v[0]-u[0],dy=v[1]-u[1],den=dx*dx+dy*dy;
    if(den<1e-8)return false;
    const t=Math.max(0,Math.min(1,((p.x-u[0])*dx+(p.y-u[1])*dy)/den));
    return Math.hypot(p.x-u[0]-t*dx,p.y-u[1]-t*dy)<=7;
  });
  const inside=(p:{x:number;y:number},outer:[number,number,number][])=>{
    let hit=false;
    for(let i=0,j=outer.length-1;i<outer.length;j=i++){
      const [xi,yi]=outer[i],[xj,yj]=outer[j];
      if((yi>p.y)!==(yj>p.y)&&p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi)hit=!hit;
    }
    return hit;
  };
  const gradient=(ring:[number,number,number][])=>{
    const a=ring[0];
    for(let i=1;i<ring.length;i++)for(let j=i+1;j<ring.length;j++){
      const b=ring[i],c=ring[j],dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1];
      const det=dx1*dy2-dx2*dy1;
      if(Math.abs(det)>1e-6)return {gx:((b[2]-a[2])*dy2-(c[2]-a[2])*dy1)/det,
        gy:(dx1*(c[2]-a[2])-dx2*(b[2]-a[2]))/det};
    }
    return null;
  };
  return model.pieces.filter(p=>p.role==="topChord").flatMap(piece=>{
    const a=nodes.get(piece.start),b=nodes.get(piece.end);
    if(!a||!b)return [];
    // A chord under the interior of a face supports it just as much as one on
    // its edge; both ends must project on (or inside) the same face outline.
    const covers=(p:{x:number;y:number},outer:[number,number,number][])=>nearEdge(p,outer)||inside(p,outer);
    const related=faces.filter(f=>f.supportPieceIds.includes(piece.id)||
      (covers(a,f.outer)&&covers(b,f.outer)));
    if(!related.length)return [];
    const face=related[0],g=gradient(face.outer);
    if(!g)return [];
    const expectedRiseMm=g.gx*(b.x-a.x)+g.gy*(b.y-a.y),modelRiseMm=b.z-a.z,
      deltaMm=modelRiseMm-expectedRiseMm;
    return [{pieceId:piece.id,faceId:face.id,expectedRiseMm,modelRiseMm,deltaMm,
      status:Math.abs(deltaMm)>DIMENSION_CONFLICT_TOLERANCE_MM?"PENDENTE" as const:"CONFERIDO" as const,
      relation:face.supportPieceIds.includes(piece.id)?"apoio explicitamente declarado":"coincidência geométrica em planta; apoio NÃO declarado"}];
  });
}
