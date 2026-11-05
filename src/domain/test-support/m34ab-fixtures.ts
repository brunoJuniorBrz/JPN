import { readFileSync } from "node:fs";
import { projectSchema,type Project } from "../models";
import { structureSignature } from "../calculations/project-basis";
import { resolvePhysicalStructure } from "../physical-structure";
import { inspectConnectivity } from "../spatial-connectivity";
export function m34abProject(){return projectSchema.parse(JSON.parse(readFileSync(new URL("./m34ab-declared.json",import.meta.url),"utf8")));}
/** Explicit test review only. Production does not auto-confirm connections. */
export function reviewM34Fixture(p:Project){
  const d=p.workspace.spatialPreparation!,signature=structureSignature(p);
  d.geometrySignature=signature;
  d.connectivity={version:1,geometrySignature:signature,reviewSource:"Explicit synthetic topology review for THIS changed test model",
    junctions:inspectConnectivity(resolvePhysicalStructure(p).model!).junctions.map(j=>({nodeId:j.nodeId,pieceIds:j.pieceIds,decision:"connect"}))};
  return p;
}
