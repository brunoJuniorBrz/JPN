import type {Project} from "./models";
import type {discretizeGeometry} from "./spatial-connectivity";
import {resolvePhysicalStructure} from "./physical-structure";
import {resolveMemberPhysical} from "./member-physical";

/** C2 audit: global stability must not rest on bending continuity that a
 * purlin merely INHERITED from its group default.
 *
 * Nothing here adds stiffness, supports or tolerances. The audit only builds a
 * counterfactual request in which the presumed (group-inherited) bending
 * continuity of purlin ends is released; the existing solver and its existing
 * mechanism/conditioning/movement gates decide the outcome.
 *
 * A purlin end whose connection was declared for THAT piece (memberConnections
 * with a value other than "inherit") is an explicit physical declaration and
 * is preserved unchanged. Torsion is never released by this audit. */
export const secondaryRoles=["purlin"] as const;
type Release=[boolean,boolean,boolean,boolean,boolean,boolean];
type Member={id:string;kind:"frame"|"axial";start:string;end:string;release_start?:Release;release_end?:Release};
type Prepared={request:{members:Member[]};mapping:ReturnType<typeof discretizeGeometry>};
export type PresumedEnd={pieceId:string;memberId:string;end:"start"|"end";nodeId:string;inheritedConnection:string};

export function presumedSecondaryFixity(project:Project,prepared:Prepared):PresumedEnd[]{
  const draft=project.workspace.spatialPreparation,model=resolvePhysicalStructure(project).model;
  if(!draft||!model)throw Error("SECONDARY_FIXITY_INPUT: preparação e geometria física são obrigatórias.");
  const members=new Map(prepared.request.members.map(m=>[m.id,m])),ends:PresumedEnd[]=[];
  for(const piece of model.pieces){
    if(!(secondaryRoles as readonly string[]).includes(piece.role))continue;
    const override=draft.memberConnections.find(m=>m.pieceId===piece.id),inherited=resolveMemberPhysical(piece,draft).properties.connection;
    for(const end of ["start","end"] as const){
      if(override&&override[end]!=="inherit")continue; // explicit per-piece declaration: preserved
      const segment=prepared.mapping.members.find(m=>m.originalId===piece.id&&(end==="start"?m.originalStart:m.originalEnd));
      if(!segment)throw Error(`SECONDARY_FIXITY_INPUT: ${piece.id}: extremidade original sem segmento mapeado.`);
      const member=members.get(segment.id);
      if(!member)throw Error(`SECONDARY_FIXITY_INPUT: ${segment.id}: segmento ausente da entrada do solver.`);
      if(member.kind!=="frame")continue; // an axial bar transmits no end moment
      const release=end==="start"?member.release_start!:member.release_end!;
      if(release[4]&&release[5])continue; // bending already released in both local planes
      ends.push({pieceId:piece.id,memberId:member.id,end,nodeId:end==="start"?member.start:member.end,inheritedConnection:inherited});
    }
  }
  return ends;
}

/** Same model, loads and supports; ONLY the presumed purlin bending continuity is released. */
export function secondaryFixityCounterfactual<P extends Prepared>(project:Project,prepared:P):{schema_version:"jpn.secondary-fixity-audit/1";presumedEnds:PresumedEnd[];request:P["request"]|null}{
  const presumedEnds=presumedSecondaryFixity(project,prepared);
  if(!presumedEnds.length)return {schema_version:"jpn.secondary-fixity-audit/1" as const,presumedEnds,request:null};
  const request:P["request"]=structuredClone(prepared.request);
  for(const e of presumedEnds){
    const member=request.members.find(m=>m.id===e.memberId)!,key=e.end==="start"?"release_start":"release_end";
    const release=[...member[key]!] as Release;release[4]=true;release[5]=true;member[key]=release;
  }
  return {schema_version:"jpn.secondary-fixity-audit/1" as const,presumedEnds,request};
}

export type CounterfactualOutcome={completed:true}|{completed:false;refusalCode:string};
const blocked={computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
/** Interprets the solver's answer for the counterfactual. Never an approval. */
export function assessSecondaryFixity(audit:ReturnType<typeof secondaryFixityCounterfactual>,outcome:CounterfactualOutcome|null){
  const pieces=[...new Set(audit.presumedEnds.map(e=>e.pieceId))];
  if(!audit.request)return {status:"no-presumed-fixity" as const,blockingCode:null,pieces,...blocked,
    message:"Nenhuma continuidade de flexão de terça é herdada do grupo; nada foi presumido."};
  if(!outcome)throw Error("SECONDARY_FIXITY_AUDIT_PENDING: execute o modelo contrafactual antes de publicar resultados.");
  if(outcome.completed)return {status:"independent-of-presumed-fixity" as const,blockingCode:null,pieces,...blocked,
    message:"O modelo permanece estável e dentro do domínio linear sem a continuidade presumida das terças."};
  const code=outcome.refusalCode==="UNSTABLE"?"STABILITY_DEPENDS_ON_SECONDARY_FIXITY":
    ["ILL_CONDITIONED","MODEL_LIMIT"].includes(outcome.refusalCode)?"STIFFNESS_DEPENDS_ON_SECONDARY_FIXITY":"SECONDARY_FIXITY_AUDIT_INCONCLUSIVE";
  return {status:"blocked" as const,blockingCode:code,solverRefusal:outcome.refusalCode,pieces,...blocked,
    message:code==="STABILITY_DEPENDS_ON_SECONDARY_FIXITY"?
      "Sem a continuidade de flexão herdada pelas terças a estrutura é um mecanismo. Declare o sistema de estabilidade real ou a ligação resistente a momento de cada terça, peça por peça.":
      code==="STIFFNESS_DEPENDS_ON_SECONDARY_FIXITY"?
      "Sem a continuidade de flexão herdada pelas terças o modelo sai do domínio linear ou fica mal condicionado; a rigidez global depende de uma ligação não declarada.":
      "O modelo contrafactual foi recusado por outro motivo; a independência não foi demonstrada."};
}

/** Purlin ends whose moment continuity was declared for THAT piece. They are
 * preserved by the audit, but a declaration is not a verified connection:
 * strength and rotational stiffness stay explicitly unverified. */
export type DeclaredMomentEnd={pieceId:string;memberId:string;end:"start"|"end";nodeId:string;declaredConnection:string;connectionCapacityVerified:false;rotationalStiffnessVerified:false};
export function declaredSecondaryMomentEnds(project:Project,prepared:Prepared):DeclaredMomentEnd[]{
  const draft=project.workspace.spatialPreparation,model=resolvePhysicalStructure(project).model;
  if(!draft||!model)throw Error("SECONDARY_FIXITY_INPUT: preparação e geometria física são obrigatórias.");
  const members=new Map(prepared.request.members.map(m=>[m.id,m])),ends:DeclaredMomentEnd[]=[];
  for(const piece of model.pieces){
    if(!(secondaryRoles as readonly string[]).includes(piece.role))continue;
    const override=draft.memberConnections.find(m=>m.pieceId===piece.id);if(!override)continue;
    for(const end of ["start","end"] as const){
      if(override[end]==="inherit")continue;
      const segment=prepared.mapping.members.find(m=>m.originalId===piece.id&&(end==="start"?m.originalStart:m.originalEnd)),member=segment&&members.get(segment.id);
      if(!member)throw Error(`SECONDARY_FIXITY_INPUT: ${piece.id}: extremidade original sem segmento na entrada do solver.`);
      if(member.kind!=="frame")continue;
      const release=end==="start"?member.release_start!:member.release_end!;
      if(release[4]&&release[5])continue; // declared as a bending hinge: no moment relied upon
      ends.push({pieceId:piece.id,memberId:member.id,end,nodeId:end==="start"?member.start:member.end,declaredConnection:override[end],connectionCapacityVerified:false,rotationalStiffnessVerified:false});
    }
  }
  return ends;
}

/** Failures of the executor or transport itself. They say nothing about the
 * structure, so they propagate instead of being read as a physical verdict. */
export const executorFailureCodes:ReadonlySet<string>=new Set(["LOCAL_ONLY","REMOTE_DISABLED","CONFIGURATION","CLEANUP_FAILURE","INPUT_LIMIT","OUTPUT_LIMIT","BUSY","TIMEOUT","CANCELLED",
  "UNAVAILABLE","SERVICE_FAILURE","INVALID_RESPONSE","INVALID_INPUT","MEMORY_LIMIT","MEMORY_LIMIT_UNAVAILABLE","DEPENDENCY_VERSION","REMOTE_UNAUTHORIZED","REMOTE_FORBIDDEN"]);
export class SecondaryFixityBlocked extends Error{
  constructor(public readonly code:string,message:string,public readonly pieces:string[]){super(`${code}: ${message}`);this.name="SecondaryFixityBlocked";}
}
/** The audit as one step of the normal analysis flow. `solve` runs the EXISTING
 * solver on the counterfactual request and reports only whether it completed or
 * which refusal code it returned. A blocked verdict throws: the declared
 * result must not be published as if the structure were stable on its own. */
export async function auditSecondaryFixity<P extends Prepared>(project:Project,prepared:P,solve:(request:P["request"])=>Promise<CounterfactualOutcome>){
  const counter=secondaryFixityCounterfactual(project,prepared);
  const verdict=assessSecondaryFixity(counter,counter.request?await solve(counter.request):null);
  if(verdict.status==="blocked")throw new SecondaryFixityBlocked(verdict.blockingCode,verdict.message,verdict.pieces);
  return {schema_version:"jpn.secondary-fixity-verdict/1" as const,status:verdict.status,message:verdict.message,
    presumedEnds:counter.presumedEnds,declaredMomentEnds:declaredSecondaryMomentEnds(project,prepared),
    counterfactualExecuted:!!counter.request,
    scope:"Only bending continuity that purlins inherit from their group is released. Declared per-piece moment connections are preserved with unverified capacity and stiffness; bracing, diaphragm action of roofing and connection resistance are not verified.",
    computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}
export type SecondaryFixityVerdict=Awaited<ReturnType<typeof auditSecondaryFixity>>;