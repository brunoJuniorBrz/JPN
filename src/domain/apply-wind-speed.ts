import type { Project } from "./models";
import { calculateWindSpeed } from "./wind-speed";
import { distributeWindActions } from "./wind-load-path";
import { spatialPreparationSchema } from "./spatial-preparation";

/** Explicit action: replace pressure for this incidence and invalidate review. */
export function applyWindSpeed(project:Project,caseId:string,value:unknown){
  const draft=project.workspace.spatialPreparation,wind=draft?.loading?.wind;
  if(!draft?.loading||!wind?.cases.some(c=>c.id===caseId))throw Error("Selecione um caso de vento físico existente.");
  const result=calculateWindSpeed(value),loading={...draft.loading,wind:{...wind,cases:wind.cases.map(c=>c.id===caseId?{...c,dynamicPressurePa:result.dynamicPressurePa,speedCalculation:result.input}:c)}};
  delete loading.overlapReview;
  const next={...project,workspace:{...project.workspace,spatialPreparation:spatialPreparationSchema.parse({...draft,loading})}};
  distributeWindActions(next,loading.wind);return {project:next,result};
}
