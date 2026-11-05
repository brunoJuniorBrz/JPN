import type { Project } from "./models";
import { resolvePhysicalStructure } from "./physical-structure";
import { sectionAnalysisRequestSchema,sectionAnalysisResultSchema } from "./section-analysis";
import { mixedInputHash } from "./mixed-analysis";

/** Explicit user action: changes the physical solver GROUP, invalidating every
 * dependent result. Does not edit commercial/visual profile specifications. */
export async function applyCalculatedSection(project:Project,pieceId:string,input:unknown,value:unknown){
  const request=sectionAnalysisRequestSchema.parse(input),result=sectionAnalysisResultSchema.parse(value),draft=project.workspace.spatialPreparation;
  const piece=resolvePhysicalStructure(project).model?.pieces.find(p=>p.id===pieceId),d=draft?.resistance?.find(d=>d.pieceId===pieceId);
  if(draft?.physicalCatalog?.assignments.some(a=>a.pieceId===pieceId))throw Error("A peça usa seção por referência. Confira e registre os valores no catálogo físico; a aplicação ao grupo não altera sua atribuição individual.");
  if(!draft||!piece||!d?.geometry)throw Error("Geometria física atual da peça necessária.");
  const g=d.geometry,keys=request.geometry.shape==="i"?["height","width","webThickness","flangeThickness","insideRadius"]:["height","width","wallThickness","lip","insideRadius"];
  const computedDimensions=request.geometry as Record<string,unknown>;
  if(request.geometry.shape!==g.shape||keys.some(k=>g.dimensionsMm[k as keyof typeof g.dimensionsMm]!==computedDimensions[k])||request.source!==g.source||request.revision!==g.revision)throw Error("Geometria revisada: recalcule a seção física.");
  if(result.input_sha256!==await mixedInputHash(request)||result.convergence.status!=="observed")throw Error("Cálculo incompatível ou refinamento não atingido.");
  const group=draft.groups[piece.role];if(group.nu!==request.poisson)throw Error("Poisson do cálculo deve corresponder ao material físico do grupo.");
  const p=result.properties,properties={areaCm2:p.areaMm2/100,iyCm4:p.iyMm4/1e4,izCm4:p.izMm4/1e4,jCm4:p.jMm4/1e4,wyCm3:Math.min(p.wyPositiveMm3,p.wyNegativeMm3)/1000,wzCm3:Math.min(p.wzPositiveMm3,p.wzNegativeMm3)/1000};
  // Storage quantization is explicit, not an engineering percent tolerance.
  // Sparse warping solves need not reproduce their last binary digits across
  // processes/OS. Preserve the full calculation export and store SIX reported
  // significant figures with their absolute last-digit resolution.
  const rounded=Object.fromEntries(Object.entries(properties).map(([k,v])=>[k,Number(v.toPrecision(6))])) as typeof properties;
  const resolutions={...d.sectionPropertyResolutions,...Object.fromEntries(Object.entries(properties).map(([k,v])=>[k,10**(Math.floor(Math.log10(v))-5)]))};
  const source=`sectionproperties 3.10.2; 6 algarismos significativos; ${request.source}; entrada ${result.input_sha256}`;
  return {...project,workspace:{...project.workspace,spatialPreparation:{...draft,
    groups:{...draft.groups,[piece.role]:{...group,areaCm2:rounded.areaCm2,iyCm4:rounded.iyCm4,izCm4:rounded.izCm4,jCm4:rounded.jCm4,sectionSource:source,sectionRevision:request.revision}},
    resistance:draft.resistance!.map(v=>v.pieceId===pieceId?{...v,sectionProperties:{...v.sectionProperties,...rounded},sectionPropertyResolutions:resolutions}:v),
  }}};
}
