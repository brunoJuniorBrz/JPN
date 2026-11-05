import type { Project } from "./models";
import { compileEngineeringCombinations } from "./engineering-combinations";
import { spatialPreparationSchema } from "./spatial-preparation";

/** Explicit replacement, with the same validation as technical package import.
 * Factors and purposes are declarations, never a normative certification. */
export function applyEngineeringCombinations(project:Project,value:unknown):Project {
  const draft=project.workspace.spatialPreparation;
  if(!draft)throw Error("Declare o modelo físico antes das combinações.");
  const compiled=compileEngineeringCombinations(value,draft.cases.map(c=>c.id));
  const loading=draft.loading?{...draft.loading}:undefined;
  if(loading)delete loading.overlapReview;
  return {...project,workspace:{...project.workspace,spatialPreparation:spatialPreparationSchema.parse({...draft,
    combinations:compiled.combinations,engineeringCombinations:compiled.declaration,...(loading?{loading}:{}),
  })}};
}
