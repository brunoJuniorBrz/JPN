import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { structureSignature } from "./calculations/project-basis";
import { adaptMixedProject } from "./mixed-adapter";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { mixedInputHash } from "./mixed-analysis";
import { anyMixedRequestSchema,anyMixedResultSchema } from "./structural-loading";
import { extractMemberDemands,type DemandInput } from "./member-demands";
import { connectionsSchema } from "./connections";
import { verifyJointActionTrace,toGlobal,cross3,scale3,type V3,type V6 } from "./member-end-actions";
import { canonicalSpatialInput } from "./spatial-analysis";
import { auditConnectionGeometry } from "./connection-geometry-audit";

const add6=(a:V6,b:V6)=>a.forEach((_,i)=>a[i]+=b[i]);
const zero6=():V6=>[0,0,0,0,0,0];
const normalize=(a:V6,length:number)=>Math.hypot(...a.map((x,i)=>i<3?x:x/length));
export const jointEquilibriumTolerance={absoluteEquivalentN:1e-6,relative:1e-8} as const;
function equilibrium(residual:V6,scale:number,length:number){
  const norm=normalize(residual,length),limit=jointEquilibriumTolerance.absoluteEquivalentN+jointEquilibriumTolerance.relative*scale;
  if(!Number.isFinite(norm)||!Number.isFinite(limit)||norm>limit)throw new Error("JOINT_EQUILIBRIUM_FAILURE: forças/momentos não equilibrados; relatório bloqueado.");
  return {residualEquivalentN:norm,limitEquivalentN:limit,withinTolerance:true as const};
}

/** The native f is NODE ON MEMBER. Its negative acts on the joint.
 * Frame f includes FER for distributed loads; only compiled NODAL loads enter
 * joint balance. Distributed resultants enter the GLOBAL check separately. */
export async function buildConnectionReport(project:Project,prepared:DemandInput,value:unknown,sidecar:unknown){
  const current=await (project.workspace.spatialPreparation?.loading?adaptLoadedMixedProject(project):adaptMixedProject(project));
  if(current.input_sha256!==prepared.input_sha256||current.preparation_sha256!==prepared.preparation_sha256||canonicalSpatialInput(current.mapping)!==canonicalSpatialInput(prepared.mapping))throw new Error("STALE_CONNECTION_ANALYSIS: projeto ou ligações mudaram; execute novamente.");
  const request=anyMixedRequestSchema.parse(prepared.request),result=anyMixedResultSchema.parse(value),demands=await extractMemberDemands(prepared,result);
  const trace=verifyJointActionTrace(request,result,sidecar),model=generateStructure(project).model!,draft=project.workspace.spatialPreparation!;
  const declaration=draft.connections?connectionsSchema.parse(draft.connections):null;
  if(declaration&&declaration.geometrySignature!==structureSignature(project))throw new Error("STALE_CONNECTION_GEOMETRY: revise as declarações nesta geometria.");
  const nodes=new Map(request.nodes.map(n=>[n.id,n])),pieces=new Map(model.pieces.map(p=>[p.id,p]));
  const originM:V3=[request.nodes[0].x_m,request.nodes[0].y_m,request.nodes[0].z_m];
  if(declaration?.connections.some(c=>!nodes.has(c.nodeId)))throw new Error("CONNECTION_ORPHAN: declaração refere nó físico ausente.");
  const lengthScaleM=Math.max(1e-5,...["x_m","y_m","z_m"].map(k=>Math.max(...request.nodes.map(n=>n[k as "x_m"]))-Math.min(...request.nodes.map(n=>n[k as "x_m"]))));
  const physicalNodes=request.nodes.map(node=>{
    const segments=prepared.mapping.members.filter(m=>m.start===node.id||m.end===node.id);
    const originalIds=[...new Set(segments.map(m=>m.originalId))];
    const d=declaration?.connections.find(c=>c.nodeId===node.id)??null,issues:string[]=[];
    if(!d)issues.push("Ligação identificada no modelo físico; tipo construtivo ainda não declarado.");
    else{
      if(d.participants.length!==originalIds.length||d.participants.some(p=>!originalIds.includes(p.pieceId)))issues.push("Participantes declarados não correspondem a todas as peças incidentes deste nó.");
      if(d.offsetGlobalM===null)issues.push("Excentricidade física ainda não declarada; nenhuma foi presumida.");
      else if(d.offsetGlobalM.some(x=>x!==0))issues.push("Excentricidade não nula ainda não representada no modelo; não se transferem forças automaticamente a outro ponto.");
      if(d.stiffness)issues.push("Rigidezes de ligação cadastradas não são aplicadas ao solver atual; procedimento semirrígido pendente.");
      for(const participant of d.participants){
        if(["pending","semi-rigid"].includes(participant.behavior))issues.push(`${participant.pieceId}: comportamento pendente ou semirrígido não representado.`);
        for(const s of segments.filter(s=>s.originalId===participant.pieceId)){
          const m=request.members.find(m=>m.id===s.id)!,end=s.start===node.id?"start":"end";
          if(participant.behavior==="as-modeled")continue;
          if(m.kind==="axial"){if(participant.behavior!=="axial")issues.push(`${s.id}: declaração contradiz elemento exclusivamente axial.`);}
          else{const releases=end==="start"?m.release_start:m.release_end;
            if(participant.behavior==="axial"||participant.behavior==="rigid"&&releases.some(Boolean)||participant.behavior==="pinned"&&!releases.slice(3).every(Boolean))issues.push(`${s.id}/${end}: hipótese declarada difere das liberações efetivamente analisadas.`);
          }
        }
      }
      const roles=originalIds.map(id=>pieces.get(id)!.role);
      if(d.typology==="column-base"&&(!request.supports.some(s=>s.node===node.id)||!roles.includes("column")))issues.push("Base declarada exige pilar e apoio físico existentes no modelo.");
      if(d.typology==="purlin-support"&&(!roles.includes("purlin")||originalIds.length<2))issues.push("Apoio de terça exige terça e outra peça participante fisicamente modeladas.");
      if(d.typology==="beam-column"&&(!roles.includes("column")||roles.every(r=>r==="column")))issues.push("Ligação viga/pilar exige pilar e outra peça identificados no nó.");
      const originalEnds=new Set(segments.filter(s=>s.start===node.id?s.originalStart:s.originalEnd).map(s=>s.originalId));
      if(d.typology==="splice"&&originalEnds.size<2)issues.push("Segmentação interna não é emenda; declare encontro de extremidades de pelo menos duas peças distintas.");
      for(const component of d.components)if(component.kind==="restraint"&&component.pieceId&&!pieces.has(component.pieceId))issues.push(`${component.id}: contenção refere peça física inexistente.`);
    }
    const geometryAudit=d?auditConnectionGeometry(d):null;if(geometryAudit?.status==="invalid-geometry")issues.push(...geometryAudit.issues.filter(i=>i.severity==="error").map(i=>i.message));
    return {nodeId:node.id,positionM:[node.x_m,node.y_m,node.z_m] as V3,
      participants:originalIds.map(id=>({pieceId:id,role:pieces.get(id)!.role,segments:segments.filter(s=>s.originalId===id)})),declaration:d,
      componentData:d?.components.map(c=>({componentId:c.id,kind:c.kind,missingFields:Object.entries(c).filter(([,v])=>v===null||v==="").map(([k])=>k)}))??[],geometryAudit,
      state:{identified:true as const,physicallyDeclared:!!d,hypothesisConsistent:!!d&&!issues.length,resistanceVerified:false as const,fabricationApproved:false as const},issues};
  });
  const combinations=request.combinations.map(combo=>{
    const raw=trace.combinations[combo.id],response=result.combinations[combo.id],globalResidual=zero6();let globalScale=0;
    const joints=physicalNodes.map(node=>{
      const active=response.nodes[node.nodeId].active_rotations,support=request.supports.find(s=>s.node===node.nodeId),rawNode=response.nodes[node.nodeId];
      const solverNodal=[...rawNode.reaction_force_n,...rawNode.reaction_moment_nm] as V6;
      const reaction=solverNodal.map((x,i)=>support?.restrained[i]?x:0) as V6;
      const applied=raw.nodal_loads[node.nodeId] as V6,residual=zero6();add6(residual,applied);add6(residual,reaction);
      let scale=normalize(applied,lengthScaleM)+normalize(reaction,lengthScaleM);
      const ends=node.participants.flatMap(p=>p.segments.map(segment=>{
        const end=segment.start===node.nodeId?0:1,m=request.members.find(m=>m.id===segment.id)!,native=raw.members?.[segment.id],member=response.members[segment.id];
        let global:V6,local:{forceN:V3;momentNm:V3}|{axialN:number};
        if(member.kind==="frame"){
          local={forceN:member.end_actions_local.slice(end*6,end*6+3) as V3,momentNm:member.end_actions_local.slice(end*6+3,end*6+6) as V3};
          const r=trace.members[segment.id].global_to_local;
          global=native?.kind==="frame"?native.node_on_member_global.slice(end*6,end*6+6) as V6:[...toGlobal(r,local.forceN),...toGlobal(r,local.momentNm)];
        }else if(member.kind==="axial"){
          const force=scale3(trace.members[segment.id].global_to_local[0],(end===0?-1:1)*member.axial_n);
          global=[...(native?.kind==="axial"?native.node_on_member_force_n[end]:force),0,0,0];local={axialN:(end===0?-1:1)*member.axial_n};
        }else throw new Error("JOINT_TRACE_INVALID: tipos físicos incompatíveis.");
        const memberOnNode=global.map(x=>-x) as V6;add6(residual,memberOnNode);scale+=normalize(memberOnNode,lengthScaleM);
        return {pieceId:p.pieceId,segmentId:segment.id,role:p.role,end:end===0?"start":"end",kind:m.kind,
          originalPieceEnd:end===0?segment.originalStart:segment.originalEnd,
          originalFraction:end===0?segment.t0:segment.t1,
          globalToLocal:trace.members[segment.id].global_to_local,rotationDeg:m.kind==="frame"?m.rotation_deg:null,
          releases:m.kind==="frame"?(end===0?m.release_start:m.release_end):null,
          nodeOnMemberLocal:local,memberOnNodeGlobal:{forceN:memberOnNode.slice(0,3) as V3,momentNm:m.kind==="frame"?memberOnNode.slice(3) as V3:null}};
      }));
      const balance=equilibrium(residual,scale,lengthScaleM);
      const external=applied.map((x,i)=>x+reaction[i]) as V6;add6(globalResidual,external);
      const moment=cross3(node.positionM.map((x,i)=>x-originM[i]) as V3,external.slice(0,3) as V3);moment.forEach((x,i)=>globalResidual[i+3]+=x);
      globalScale+=normalize(external,lengthScaleM);
      return {nodeId:node.nodeId,ends,externalNodal:{forceN:applied.slice(0,3) as V3,momentNm:active?applied.slice(3) as V3:null},
        support:support??null,reaction:{forceN:reaction.slice(0,3) as V3,momentNm:active?reaction.slice(3) as V3:null},
        solverResidualInFreeDofs:solverNodal.map((x,i)=>(i>=3&&!active)||support?.restrained[i]?null:x),
        residual:{forceN:residual.slice(0,3) as V3,momentNm:active?residual.slice(3) as V3:null},balance,
        dofs:{translation:(support?.restrained.slice(0,3)??[false,false,false]).map(x=>x?"restrained":"free"),rotation:active?(support?.restrained.slice(3)??[false,false,false]).map(x=>x?"restrained":"free"):null}};
    });
    // Global body-load resultants: frame UDL and frame self-weight only.
    const bodies:{member:string;forceN:V3}[]=[];
    if(request.schema_version==="jpn.mixed3d/2"){
      for(const l of request.member_loads){const m=request.members.find(m=>m.id===l.member)!,a=nodes.get(m.start)!,b=nodes.get(m.end)!,length=Math.hypot(b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m);
        const q=l.coordinate_system==="global"?l.force_per_length_n_m:toGlobal(trace.members[m.id].global_to_local,l.force_per_length_n_m);
        bodies.push({member:m.id,forceN:scale3(q,length*(combo.factors[l.case]??0))});}
      if(result.schema_version==="jpn.mixed3d-result/2"&&result.loading.self_weight){const sw=result.loading.self_weight;for(const w of sw.members)if(w.representation==="consistent-frame-udl")bodies.push({member:w.member,forceN:scale3(w.force_n,combo.factors[sw.case]??0)});}
    }
    for(const body of bodies){const m=request.members.find(m=>m.id===body.member)!,a=nodes.get(m.start)!,b=nodes.get(m.end)!,mid:V3=[(a.x_m+b.x_m)/2,(a.y_m+b.y_m)/2,(a.z_m+b.z_m)/2];
      const relativeMoment=cross3(mid.map((x,i)=>x-originM[i]) as V3,body.forceN);
      add6(globalResidual,[...body.forceN,...relativeMoment]);globalScale+=normalize([...body.forceN,...relativeMoment],lengthScaleM);}
    const globalBalance=equilibrium(globalResidual,globalScale,lengthScaleM);
    return {combinationId:combo.id,joints,distributedBodyResultants:bodies,originM,globalResidual:{forceN:globalResidual.slice(0,3),momentNm:globalResidual.slice(3)},globalBalance};
  });
  const report={schema_version:"jpn.connection-report/1" as const,units:"SI" as const,approvedForFabrication:false as const,
    binding:{...demands.binding,traceSha256:await mixedInputHash(trace),declarationSha256:await mixedInputHash(declaration)},physicalNodes,combinations,
    diagnostics:{status:"first-order-numerically-resolved" as const,...result.diagnostics,lengthScaleM,equilibriumTolerance:jointEquilibriumTolerance,
      secondOrderVerified:false as const,normativeStabilityVerified:false as const,connectionResistanceVerified:false as const,
      pending:["Análise linear resolvida não comprova estabilidade estrutural normativa.","Semirrígidas, excentricidades, segunda ordem, ligações, ancoragens e contenções normativas não verificadas.","M23 permanece parcial; nenhuma peça é aprovada por este relatório."]},
    conventions:{localToGlobal:"Rᵀ, com R real do PyNite 3.2.1",nativeEndActions:"nó sobre barra",jointActions:"barra sobre nó = negativo da ação nativa global",jointBalance:"soma(barra sobre nó) + carga nodal compilada + reação efetivamente vinculada = 0",bodyLoads:"UDL/peso de pórtico entram no balanço global; não são somados novamente na junta",axial:"somente força; momentos/rotações do elemento axial não existem",segmentation:"corte interno contínuo não é emenda de fabricação"}};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export type ConnectionReport=Awaited<ReturnType<typeof buildConnectionReport>>;
export async function assertConnectionReportCurrent(report:ConnectionReport,project:Project,prepared:DemandInput,result:unknown,trace:unknown){
  const {reportSha256,...body}=report;
  if(await mixedInputHash(body)!==reportSha256)throw new Error("STALE_CONNECTION_REPORT: conteúdo do relatório alterado.");
  if((await buildConnectionReport(project,prepared,result,trace)).reportSha256!==reportSha256)throw new Error("STALE_CONNECTION_REPORT: revisão, ações ou declaração alteradas.");
}
