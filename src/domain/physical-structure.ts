import type { Project } from "./models";
import type { PhysicalGeometry } from "./structure";
import { declaredStructureSchema } from "./declared-structure";
import { generateStructure } from "./calculations/structure";

export function resolvePhysicalStructure(project:Project):{source:"generated"|"declared";model:PhysicalGeometry|null}{
  const value=project.workspace.physicalStructure;
  if(value===undefined)return {source:"generated",model:generateStructure(project).model};
  const d=declaredStructureSchema.parse(value),nodes=new Map(d.nodes.map(n=>[n.id,n]));
  return {source:"declared",model:{units:d.units,nodes:d.nodes,pieces:d.pieces.map(p=>{
    const a=nodes.get(p.start)!,b=nodes.get(p.end)!;return {...p,lengthMm:Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)};
  })}};
}
export function assertGeneratedPhysicalStructure(project:Project,capability:string){
  if(project.workspace.physicalStructure!==undefined)throw Error(`DECLARED_STRUCTURE_UNSUPPORTED: ${capability} exige topologia de cobertura gerada; estrutura declarada aceita apenas cargas nodais explícitas nesta versão.`);
}
