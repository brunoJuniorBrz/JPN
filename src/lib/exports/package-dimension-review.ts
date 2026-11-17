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
