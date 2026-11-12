import type {Project} from "./models";
import type {SpatialPreparation} from "./spatial-preparation";
import {structureSignature} from "./calculations/project-basis";
import {resolvePhysicalStructure} from "./physical-structure";
import {resolveMemberPhysical} from "./member-physical";
import {physicalRestraintsSchema} from "./physical-restraint-contracts";
import {anyMixedRequestSchema,anyMixedResultSchema,verifyLoadingTrace} from "./structural-loading";
import {mixedInputHash,verifyMixedResult} from "./mixed-analysis";
import {verifyJointActionTrace,type V3} from "./member-end-actions";
import type {DemandInput} from "./member-demands";
import type {extractContinuousDemands} from "./continuous-demands";
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=(a:readonly number[])=>a.map(v=>v/Math.hypot(...a));
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-7;

/** Review only EXISTING physical nodes, supports and axial members. No nearest
 * node, sheeting stiffness, fictitious support, spring or rigid brace is added. */
export function reviewPhysicalRestraints(project:Project,draft:SpatialPreparation){
  const issues:{code:string;message:string}[]=[],add=(message:string)=>issues.push({code:"PHYSICAL_RESTRAINT",message});
  if(!draft.physicalRestraints)return issues;
  const parsed=physicalRestraintsSchema.safeParse(draft.physicalRestraints);
  if(!parsed.success){add(parsed.error.message);return issues;}
  const declaration=parsed.data,model=resolvePhysicalStructure(project).model;
  if(!project.workspace.physicalStructure||!model){add("Declared restraints require the measured physical model");return issues;}
  if(declaration.geometrySignature!==structureSignature(project)){add("STALE_RESTRAINTS: review positions and bindings for the current geometry");return issues;}
  const nodes=new Map(model.nodes.map(n=>[n.id,n])),pieces=new Map(model.pieces.map(p=>[p.id,p])),bindings=new Set<string>();
  for(const r of declaration.items){
    const piece=pieces.get(r.pieceId),node=nodes.get(r.nodeId);
    if(!piece||!node){add(r.id+": missing member/node");continue;}
    const a=nodes.get(piece.start)!,b=nodes.get(piece.end)!,axis=unit([b.x-a.x,b.y-a.y,b.z-a.z]);
    const at=[a.x,a.y,a.z].map((v,i)=>v/1000+r.positionM*axis[i]);
    if(r.positionM>piece.lengthMm/1000+1e-7||![node.x,node.y,node.z].every((v,i)=>near(v/1000,at[i]))){add(r.id+": position is not an explicit node on the original member");continue;}
    const alignment=Math.abs(dot(axis,r.directionGlobal));
    if(r.kind==="torsional"&&Math.abs(alignment-1)>1e-10||r.kind==="lateral"&&alignment>=1-1e-10){add(r.id+": direction contradicts the physical restraint kind");continue;}
    const physical=resolveMemberPhysical(piece,draft).properties;
    if((draft.memberKinds?.find(k=>k.pieceId===piece.id)?.kind??physical.elementKind)!=="frame")add(r.id+": restrained member must be a frame");
    if(r.binding.kind==="support"){
      const axisIndex=r.directionGlobal.findIndex(v=>Math.abs(Math.abs(v)-1)<=1e-10);
      if(axisIndex<0){add(r.id+": oblique support constraints require an unsupported multipoint formulation");continue;}
      const dof=axisIndex+(r.kind==="torsional"?3:0),support=draft.supports.find(s=>s.nodeId===r.nodeId),face=draft.supportInterfaces?.find(s=>s.nodeId===r.nodeId);
      if(!support||support.dofs[dof]!=="fixed"||!face||face.dofs[dof]!=="fixed")add(r.id+": no matching declared support DOF and physical interface");
      if(r.kind==="lateral"&&alignment>1e-10)add(r.id+": grounded lateral restraint must be transverse to the member");
      if(r.kind==="torsional"&&(r.nodeId===piece.start||r.nodeId===piece.end)){
        const end=r.nodeId===piece.start?"start":"end",override=draft.memberConnections.find(m=>m.pieceId===piece.id)?.[end];
        if((override&&override!=="inherit"?override:physical.connection)==="pinned")add(r.id+": spherical end release disconnects torsion from this support");
      }
      const key=`support:${r.nodeId}:${dof}`;
      if(bindings.has(key))add(r.id+": duplicate binding to the same physical constraint");bindings.add(key);
    }else{
      const brace=pieces.get(r.binding.pieceId);
      if(r.kind!=="lateral"||!brace||brace.id===piece.id||![brace.start,brace.end].includes(r.nodeId)){add(r.id+": lateral binding requires a distinct incident axial brace");continue;}
      const group=resolveMemberPhysical(brace,draft).properties;
      if((draft.memberKinds?.find(k=>k.pieceId===brace.id)?.kind??group.elementKind)!=="axial")add(r.id+": brace is not an explicitly axial element");
      const c=nodes.get(brace.start)!,d=nodes.get(brace.end)!,braceAxis=unit([d.x-c.x,d.y-c.y,d.z-c.z]);
      if(Math.abs(Math.abs(dot(braceAxis,r.directionGlobal))-1)>1e-10)add(r.id+": direction is not the actual brace axis");
      const key=`brace:${brace.id}:${r.nodeId}`;
      if(bindings.has(key))add(r.id+": duplicate brace binding");bindings.add(key);
    }
  }
  return issues;
}

/** Real reactions/member actions compared only with signed DECLARED capacities.
 * An elastic axial brace is never counted as an ideal rigid intermediate brace. */
export async function auditPhysicalRestraints(project:Project,prepared:DemandInput,value:unknown,sidecar:unknown,continuous:Awaited<ReturnType<typeof extractContinuousDemands>>){
  const draft=project.workspace.spatialPreparation!,issues=reviewPhysicalRestraints(project,draft);
  if(issues.length)throw Error(issues.map(i=>i.message).join("; "));
  const request=anyMixedRequestSchema.parse(prepared.request);
  if(request.project.id!==project.id||prepared.preparation_sha256!==await mixedInputHash({geometry:prepared.mapping.geometrySignature,preparation:draft}))
    throw Error("STALE_RESTRAINT_ANALYSIS: physical declarations changed after analysis");
  const declaration=draft.physicalRestraints??null,result=anyMixedResultSchema.parse(value);
  verifyMixedResult(request,result,await mixedInputHash(request));verifyLoadingTrace(request,result);
  const trace=verifyJointActionTrace(request,result,sidecar);
  const items=(declaration?.items??[]).map(r=>({declaration:r,
    stiffnessRepresentation:r.binding.kind==="support"?"existing-fixed-dof" as const:"existing-finite-axial-stiffness" as const,
    combinations:request.combinations.map(c=>{
      let action:V3;
      if(r.binding.kind==="support"){
        const n=result.combinations[c.id].nodes[r.nodeId];
        action=(r.kind==="lateral"?n.reaction_force_n:n.reaction_moment_nm).map(v=>-v) as V3;
      }else{
        const braceId=r.binding.pieceId;
        const member=prepared.mapping.members.find(m=>m.originalId===braceId&&(m.start===r.nodeId||m.end===r.nodeId));
        if(!member)throw Error("RESTRAINT_BRACE_MAPPING_MISSING");
        const m=request.members.find(m=>m.id===member.id)!,response=result.combinations[c.id].members[m.id];
        if(response.kind!=="axial")throw Error("RESTRAINT_BRACE_KIND_MISMATCH");
        action=trace.members[m.id].global_to_local[0].map(v=>v*response.axial_n*(m.start===r.nodeId?-1:1)) as V3;
      }
      const demand=dot(action,r.directionGlobal),capacity=demand>=0?r.capacity.positive:r.capacity.negative;
      return {combinationId:c.id,demand,units:r.capacity.units,actionOnRestraintGlobal:action,declaredCapacity:capacity,
        status:capacity===null?"capacity-pending" as const:Math.abs(demand)>capacity?"exceeds-declared-capacity" as const:"within-declared-capacity" as const,
        capacityVerified:false as const};
    })}));
  const model=resolvePhysicalStructure(project).model!;
  const idealFlexuralReferences=continuous.pieces.flatMap(p=>{
    const physical=model.pieces.find(m=>m.id===p.pieceId)!,group=resolveMemberPhysical(physical,draft).properties;
    const r=(declaration?.items??[]).filter(r=>r.pieceId===p.pieceId&&r.kind==="lateral"&&r.binding.kind==="support");
    const axes=p.fields[0]?.globalToLocal;
    if(!axes||!group.eGpa||!group.iyCm4||!group.izCm4)return [];
    const physicalLengthM=physical.lengthMm/1000,ePa=group.eGpa*1e9,inertias=[0,group.izCm4*1e-8,group.iyCm4*1e-8];
    return ([1,2] as const).flatMap(axis=>{
      const positions=[...new Set(r.filter(r=>Math.abs(Math.abs(dot(r.directionGlobal,axes[axis]))-1)<=1e-10).map(r=>r.positionM))].sort((a,b)=>a-b);
      if(positions.length<2||!near(positions[0],0)||!near(positions.at(-1)!,physicalLengthM))return [];
      const maximumSpanM=Math.max(...positions.slice(1).map((x,i)=>x-positions[i]));
      const inertiaM4=inertias[axis];
      return [{pieceId:p.pieceId,deflectionAxis:axis===1?"local-y" as const:"local-z" as const,positionsM:positions,maximumSpanM,
        eulerIdealN:Math.PI**2*ePa*inertiaM4/maximumSpanM**2,
        formula:"pi^2 E I / Lmax^2",basis:"Ideal flexural reference/lower bound only; constant axial force, prismatic elastic member, no torsional/local/distortional coupling",
        normativeResistance:false as const,elasticBracesCountedAsRigid:false as const}];
    });
  });
  return {schema_version:"jpn.physical-restraint-audit/1" as const,inputSha256:result.input_sha256,
    declarationSha256:await mixedInputHash(declaration),items,idealFlexuralReferences,
    normativeStabilityVerified:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}
