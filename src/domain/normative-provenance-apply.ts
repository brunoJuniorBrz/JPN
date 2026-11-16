import type {Project} from "./models";
import {spatialPreparationSchema} from "./spatial-preparation";
import {withProvenance,withoutProvenance} from "./normative-provenance";
import type {NormativeProvenance} from "./normative-provenance";
/** Persist the PROVISIONAL mark with the declarations it belongs to (exported/restored with the project). */
export function recordProvenance(project:Project,item:NormativeProvenance):Project{
  const draft=project.workspace.spatialPreparation;
  if(!draft)throw Error("Declare o modelo físico antes de registrar a origem normativa.");
  return {...project,workspace:{...project.workspace,spatialPreparation:spatialPreparationSchema.parse({...draft,normativeProvenance:withProvenance(draft.normativeProvenance,item)})}};
}
/** Remove a mark whose source was unified and checked (N3: 8681). Projects without a physical model are returned unchanged. */
export function clearProvenance(project:Project,id:NormativeProvenance["id"]):Project{
  const draft=project.workspace.spatialPreparation;
  if(!draft?.normativeProvenance?.some(p=>p.id===id))return project;
  return {...project,workspace:{...project.workspace,spatialPreparation:spatialPreparationSchema.parse({...draft,normativeProvenance:withoutProvenance(draft.normativeProvenance,id)})}};
}
