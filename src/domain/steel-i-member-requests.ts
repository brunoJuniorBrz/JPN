import type {Project} from "./models";
import {resolveMemberPhysical} from "./member-physical";
import {resolvePhysicalStructure} from "./physical-structure";
import {fitSegmentForceField} from "./member-combination-matrix";
import type {DesignExecution,ResistanceStandard} from "./member-combination-matrix";

/** INT-1d: resistance standard per piece (14762 cold-formed x 8800 I/H) and the NBR 8800 requests built ONLY from
 * what the engineer declared in the resistance preparation. Missing data -> blocked with the reason, never a default. */
export {resistanceStandardsSchema} from "./resistance-standards-schema";
export const standardOf=(project:Project,pieceId:string):ResistanceStandard=>
  project.workspace.spatialPreparation?.resistanceStandards?.find(s=>s.pieceId===pieceId)?.standard??"NBR14762";

type DemandForcesT=Parameters<typeof fitSegmentForceField>[0][number]["forces"];
export type SteelDemands={binding:{inputSha256:string;resultSha256:string};pieces:{pieceId:string;lengthM:number;segments:{id:string;t0:number;lengthMm:number}[];
  samples:{segmentId:string;combinationId:string;stationIndex:number;forces:DemandForcesT}[]}[]};
export type SteelRequest={pieceId:string;combinationId:string;request:Record<string,unknown>};
export function buildSteelIRequests(project:Project,demands:SteelDemands,ulsCombinationIds:string[],combinationKind:"normal"|"special"|"exceptional"="normal"){
  const draft=project.workspace.spatialPreparation,model=resolvePhysicalStructure(project).model;
  const requests:SteelRequest[]=[],blocked:{pieceId:string;reason:string}[]=[];
  if(!draft||!model)return {requests,blocked:[{pieceId:"*",reason:"modelo físico ausente"}]};
  for(const piece of demands.pieces){
    if(standardOf(project,piece.pieceId)!=="NBR8800")continue;
    const decl=draft.resistance?.find(d=>d.pieceId===piece.pieceId),geo=decl?.geometry,mm=(k:"height"|"width"|"webThickness"|"flangeThickness")=>geo?.dimensionsMm[k]??null;
    const why=(r:string)=>blocked.push({pieceId:piece.pieceId,reason:r});
    if(!decl||!geo){why("cadastro resistente com geometria física ausente");continue;}
    const physicalPiece=model.pieces.find(p=>p.id===piece.pieceId);
    if(!physicalPiece){why("peça sem geometria atual");continue;}
    const g=resolveMemberPhysical(physicalPiece,draft).properties;
    const missing:string[]=[];
    if(geo.shape!=="i")missing.push("geometria não é I/H");
    for(const [k,v] of [["altura",mm("height")],["largura da mesa",mm("width")],["espessura da alma",mm("webThickness")],["espessura da mesa",mm("flangeThickness")]] as const)if(!v)missing.push(k);
    for(const [k,v] of [["fy",decl.fyMpa],["fu",decl.fuMpa],["comprimento de flambagem y",decl.bucklingYM],["comprimento de flambagem z",decl.bucklingZM],["comprimento destravado",decl.lateralRestraintM],["E",g.eGpa],["G",g.gGpa]] as const)if(v===null||v===undefined)missing.push(k);
    if(decl.family!=="welded")missing.push(decl.family==="rolled"?"perfil laminado exige propriedades e raio de concordância declarados (não suportado nesta tela)":"família soldada não declarada");
    if(missing.length){why("dados ausentes: "+missing.join(", "));continue;}
    for(const combinationId of ulsCombinationIds){
      try{
        const fields=piece.segments.map(seg=>{
          const rows=piece.samples.filter(s=>s.segmentId===seg.id&&s.combinationId===combinationId).sort((a,b)=>a.stationIndex-b.stationIndex);
          if(!rows.length)throw Error("sem demanda do solver para "+combinationId);
          return {segment_id:seg.id,offset_m:seg.t0*piece.lengthM,length_m:seg.lengthMm/1000,forces:fitSegmentForceField(rows.map((r,i)=>({u:i/(rows.length-1),forces:r.forces})))};
        });
        requests.push({pieceId:piece.pieceId,combinationId,request:{schema_version:"jpn.steel-i-design/1",units:"SI",piece_id:piece.pieceId,combination_id:combinationId,combination_kind:combinationKind,
          binding:{mechanical_sha256:demands.binding.inputSha256,analysis_input_sha256:demands.binding.inputSha256,analysis_result_sha256:demands.binding.resultSha256},
          section:{family:"welded",shape:"i-h-doubly-symmetric",d_m:mm("height")!/1000,bf_m:mm("width")!/1000,tf_m:mm("flangeThickness")!/1000,tw_m:mm("webThickness")!/1000,
            fy_pa:decl.fyMpa!*1e6,fu_pa:decl.fuMpa!*1e6,e_pa:g.eGpa!*1e9,g_pa:g.gGpa!*1e9,
            effective_length_x_m:decl.bucklingYM!,effective_length_y_m:decl.bucklingZM!,effective_length_z_m:decl.lateralRestraintM!,unbraced_length_m:decl.lateralRestraintM!,
            properties:null,fillet_radius_m:null,source:geo.source.slice(0,900),revision:geo.revision.slice(0,900)},
          tension:{basis:"no-holes-all-elements-connected",source:"Sem furos declarado: seção bruta (verificar com o responsável)",revision:"INT-1d"},
          web:{transverse_stiffener_spacing_m:null},fields}});
      }catch(e){why(combinationId+": "+(e as Error).message);}
    }
  }
  return {requests,blocked};
}
export function executionOf(pieceId:string,combinationId:string,result:{checks:DesignExecution["checks"]}):DesignExecution{return {pieceId,combinationId,checks:result.checks};}
