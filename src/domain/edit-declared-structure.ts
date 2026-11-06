import { declaredStructureSchema,type DeclaredStructure } from "./declared-structure";
import { projectSchema,type Project } from "./models";
import { newSpatialPreparation } from "./spatial-preparation";
/** An atomic geometry revision. Keep physical/commercial declarations; stale
 * geometry, orphan references and connectivity are diagnosed, never guessed. */
export function editDeclaredStructure(project:Project,value:unknown):Project{
  const geometry=declaredStructureSchema.parse(value);
  const next={...project,workspace:{...project.workspace,physicalStructure:geometry}};
  if(!next.workspace.spatialPreparation)next.workspace.spatialPreparation=newSpatialPreparation(next);
  return projectSchema.parse(next);
}
export function declaredDraft(project:Project):DeclaredStructure{
  return structuredClone(project.workspace.physicalStructure??{schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",revision:"",provenance:"",nodes:[],pieces:[]});
}
/** Explicit UI command after deletions. Does not remap IDs, refresh connectivity
 * or approve anything. Commercial rows stay stale until a new takeoff. */
export function removeDeletedReferences(project:Project):Project{
  const g=project.workspace.physicalStructure,d=project.workspace.spatialPreparation;if(!g||!d)return project;
  const nodes=new Set(g.nodes.map(n=>n.id)),pieces=new Set(g.pieces.map(p=>p.id));
  return {...project,workspace:{...project.workspace,...(project.workspace.roofOutline?{roofOutline:{...project.workspace.roofOutline,supportPieceIds:project.workspace.roofOutline.supportPieceIds.filter(id=>pieces.has(id))}}:{}),spatialPreparation:{...d,supports:d.supports.filter(s=>nodes.has(s.nodeId)),loads:d.loads.filter(l=>nodes.has(l.nodeId)),
    memberKinds:d.memberKinds?.filter(m=>pieces.has(m.pieceId)),memberConnections:d.memberConnections.filter(m=>pieces.has(m.pieceId)),
    ...(d.physicalCatalog?{physicalCatalog:{...d.physicalCatalog,assignments:d.physicalCatalog.assignments.filter(a=>pieces.has(a.pieceId))}}:{}),
    ...(d.loading?{loading:{...d.loading,uniform:d.loading.uniform.filter(l=>pieces.has(l.pieceId)),overlapReview:undefined}}:{}),
    resistance:d.resistance?.filter(r=>pieces.has(r.pieceId)),serviceCriteria:d.serviceCriteria?.filter(c=>pieces.has(c.pieceId)),memberDesign:d.memberDesign?.filter(c=>pieces.has(c.pieceId)),
  }}};
}
