import type {Project} from "@/domain/models";
import {generateGeometry} from "@/domain/calculations/geometry";

/** Extrude the existing roof generator's transverse perimeter segments. No
 * interpolation of a declared roof from arbitrary bars, or structural defaults. */
export function cadRoofFaces(project:Project){
  if(project.workspace.physicalStructure)return project.workspace.spatialPreparation?.physicalRoofFaces?.faces??[];
  const geometry=generateGeometry(project.roof,project.planning?.typology).model;
  if(!geometry)return [];
  const acrossX=project.roof.fall.startsWith("width"),along=(acrossX?geometry.metrics.lengthM:geometry.metrics.widthM)*1000;
  const edges=geometry.views[acrossX?"front":"side"].entities.flatMap(e=>e.type==="line"&&e.layer==="COBERTURA"&&e.a.x!==e.b.x?[e]:[]);
  const unique=[...new Map(edges.map(e=>[[e.a,e.b].map(p=>`${p.x},${p.y}`).sort().join("|"),e])).values()];
  return unique.map((edge,i)=>{
    const at=(u:number,v:number,z:number):[number,number,number]=>acrossX?[u,v,z]:[v,u,z];
    const a=at(edge.a.x,0,edge.a.y),b=at(edge.b.x,0,edge.b.y),c=at(edge.b.x,along,edge.b.y),d=at(edge.a.x,along,edge.a.y);
    return {id:`GERADA-${i+1}`,outer:[a,b,c,d,a],holes:[] as [number,number,number][][],supportPieceIds:[],source:"Gerador geométrico da cobertura",revision:String(project.roof.revision)};
  });
}
