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
type Prepared<R extends {members:Member[]}>={request:R;mapping:ReturnType<typeof discretizeGeometry>};
export type PresumedEnd={pieceId:string;memberId:string;end:"start"|"end";nodeId:string;inheritedConnection:string};

export function presumedSecondaryFixity<R extends {members:Member[]}>(project:Project,prepared:Prepared<R>):PresumedEnd[]{
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
export function secondaryFixityCounterfactual<R extends {members:Member[]}>(project:Project,prepared:Prepared<R>){
  const presumedEnds=presumedSecondaryFixity(project,prepared);
  if(!presumedEnds.length)return {schema_version:"jpn.secondary-fixity-audit/1" as const,presumedEnds,request:null};
  const request=structuredClone(prepared.request);
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
