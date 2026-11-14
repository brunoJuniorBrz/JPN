import {z} from "zod";
import type {Project} from "./models";
import {spatialPreparationSchema} from "./spatial-preparation";
import {physicalFacadesSchema,fromFacadeLocal,facadeOrientationSchema} from "./physical-facades";
import {declaredFacadeTractionSchema} from "./declared-facade-traction-contract";
import {declaredFacadeTractionSignature} from "./declared-facade-traction";
import {emptyLoading} from "./structural-loading";
import {buildNormativeFacadeTraction} from "./wind-facade-normative";
import {WIND_PROVENANCE} from "./normative-provenance";
import {recordProvenance} from "./normative-provenance-apply";

/** INT-1d: persisted editors for the physical facades, the declared (external) facade pressure and the
 * NBR 6123 wall wind. Everything is an explicit declaration; no coordinate, support or pressure is inferred. */
const text=z.string().trim().min(5).max(1000);
export const rectangularFacadeInputSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/),outward:facadeOrientationSchema,
  /** Coordinate (mm) of the vertical plane on the axis normal to the facade (x for ±X, y for ±Y). */
  planeMm:z.number().finite().min(-1e7).max(1e7),
  /** Horizontal extent in the facade-local u axis (u = y, −y, −x, x for +X, −X, +Y, −Y) and vertical extent (mm). */
  uMinMm:z.number().finite().min(-1e7).max(1e7),uMaxMm:z.number().finite().min(-1e7).max(1e7),
  zMinMm:z.number().finite().min(-1e7).max(1e7),zMaxMm:z.number().finite().min(-1e7).max(1e7),
  supportPieceIds:z.array(z.string().min(1).max(60)).min(2).max(600),
  enclosure:z.enum(["cladded","partially-cladded","open","unknown"]),enclosureSource:text,source:text,revision:text,
}).strict().refine(v=>v.uMaxMm>v.uMinMm&&v.zMaxMm>v.zMinMm,"FACADE_RECTANGLE: máximos devem exceder mínimos");
export type RectangularFacadeInput=z.infer<typeof rectangularFacadeInputSchema>;

/** Counter-clockwise ring in the facade-local (u,z) plane, closed, as the physical facade schema requires. */
export function rectangularFacade(i:RectangularFacadeInput){
  const v=rectangularFacadeInputSchema.parse(i),ring=([[v.uMinMm,v.zMinMm],[v.uMaxMm,v.zMinMm],[v.uMaxMm,v.zMaxMm],[v.uMinMm,v.zMaxMm]] as [number,number][])
    .map(p=>fromFacadeLocal(v.outward,v.planeMm,p));
  return {id:v.id,kind:"wall" as const,outward:v.outward,enclosure:v.enclosure,outer:[...ring,ring[0]],openings:[],supportPieceIds:v.supportPieceIds,
    source:v.source,revision:v.revision,enclosureSource:v.enclosureSource};
}
function draftOf(project:Project){
  const d=project.workspace.spatialPreparation;
  if(!d)throw Error("FACADE_DECLARATION_PENDING: declare o modelo físico antes das fachadas.");
  return d;
}
const reparse=(project:Project,patch:Record<string,unknown>)=>({...project,workspace:{...project.workspace,
  spatialPreparation:spatialPreparationSchema.parse({...draftOf(project),...patch})}}) as Project;

/** Replace the physical facades (persisted with the project). Any previous facade traction becomes stale and is removed. */
export function setPhysicalFacades(project:Project,facades:RectangularFacadeInput[],source:string,revision:string):Project{
  const d=draftOf(project),ids=facades.map(f=>f.id);
  if(new Set(ids).size!==ids.length)throw Error("FACADE_DUPLICATE_ID: identificadores repetidos.");
  const loading=d.loading?{...d.loading}:undefined;
  if(loading){delete loading.facadeTraction;delete loading.overlapReview;}
  return reparse(project,{physicalFacades:facades.length?physicalFacadesSchema.parse({schema_version:"jpn.physical-facades/1",units:"mm",source:text.parse(source),
    revision:text.parse(revision),facades:facades.map(rectangularFacade)}):undefined,...(loading?{loading}:{})});
}
export const declaredTractionInputSchema=z.object({caseId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/),incidenceDeg:z.number().finite().min(0).lt(360),
  reference:text,zones:z.array(z.object({facadeId:z.string().min(1).max(60),netPressurePa:z.number().finite().min(-1e6).max(1e6)}).strict()).min(1).max(32),
  source:text,revision:text,calculationBasis:text}).strict();
/** Declared (external) net pressure per facade, one case. Cp/Cpi are NOT computed here; the case is created if missing. */
export function declareFacadeTraction(project:Project,input:z.infer<typeof declaredTractionInputSchema>):Project{
  const v=declaredTractionInputSchema.parse(input),d=draftOf(project);
  if(!d.physicalFacades)throw Error("FACADE_SURFACES_REQUIRED: declare as fachadas físicas antes da pressão.");
  const cases=d.cases.some(c=>c.id===v.caseId)?d.cases:[...d.cases,{id:v.caseId,source:"Pressão líquida de fachada declarada externamente (sem Cp/Cpi calculados pelo JPN)"}];
  const sig=declaredFacadeTractionSignature(project),previous=d.loading?.facadeTraction;
  const traction=declaredFacadeTractionSchema.parse({schema_version:"jpn.declared-facade-traction/1",normativeValidation:"pending-engineer-review",physicalSignature:sig,
    cases:[...(previous?.cases.filter(c=>c.id!==v.caseId)??[]),{id:v.caseId,incidenceDeg:v.incidenceDeg,reference:v.reference,
      zones:v.zones.map(z=>({facadeId:z.facadeId,netPressurePa:z.netPressurePa,source:v.source,revision:v.revision,calculationBasis:v.calculationBasis}))}]});
  const loading={...(d.loading??emptyLoading()),facadeTraction:traction};delete loading.overlapReview;
  return reparse(project,{cases,loading});
}
/** NBR 6123 wall wind (Tabela 6 + Cpi) -> existing declared-facade-traction input; recorded as PROVISIONAL. */
export function applyNbr6123WallWind(project:Project,raw:unknown):{project:Project;generated:ReturnType<typeof buildNormativeFacadeTraction>}{
  const d=draftOf(project),generated=buildNormativeFacadeTraction(project,raw);
  const newCases=generated.traction.cases.filter(c=>!d.cases.some(x=>x.id===c.id)).map(c=>({id:c.id,source:"Vento NBR 6123:2023 em paredes (Tabela 6 + Cpi), PROVISÓRIO: "+c.reference.slice(0,150)}));
  const loading={...(d.loading??emptyLoading()),facadeTraction:generated.traction};delete loading.overlapReview;
  const next=reparse(project,{cases:[...d.cases,...newCases],loading});
  return {project:recordProvenance(next,WIND_PROVENANCE),generated};
}
