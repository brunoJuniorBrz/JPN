import { declaredStructureSchema } from "./declared-structure";
import { projectSchema,type Project } from "./models";
import { newSpatialPreparation } from "./spatial-preparation";

/** Import only the physical model. Current project identity/commercial data stay owned by the user. */
export function importPhysicalModel(project:Project,text:string):Project{
  if(new TextEncoder().encode(text).length>5*1024*1024)throw Error("Arquivo estrutural excede 5 MB.");
  const raw:unknown=JSON.parse(text),complete=projectSchema.safeParse(raw);
  const structure=complete.success?complete.data.workspace.physicalStructure:declaredStructureSchema.parse(raw);
  if(!structure)throw Error("O arquivo de projeto não contém uma estrutura física declarada.");
  const next={...project,name:project.name.trim()|| (complete.success?complete.data.name:"Estrutura declarada"),
    client:project.client.trim()||(complete.success?complete.data.client:"Cliente a informar"),
    workspace:{...project.workspace,physicalStructure:structuredClone(structure),
      spatialPreparation:complete.success?structuredClone(complete.data.workspace.spatialPreparation):undefined}};
  if(!next.workspace.spatialPreparation)next.workspace.spatialPreparation=newSpatialPreparation(next);
  return projectSchema.parse(next);
}
