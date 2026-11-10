import type {Project} from "./models";
import {loadedMixedRequestSchema,loadedMixedResultSchema,verifyLoadingTrace} from "./structural-loading";
import {mixedInputHash,verifyMixedResult} from "./mixed-analysis";
import {canonicalSpatialInput} from "./spatial-analysis";
import {resolvePhysicalStructure} from "./physical-structure";
import {declaredRoofDistributionSignature,distributeDeclaredRoofActions} from "./declared-roof-load-path";
import {assessSupportReactions,reviewSupportInterfaces} from "./support-interface";

/** Distinguish a verified declared-face trace from generated visual roof loads.
 * Callers still validate the underlying face signature and solver hash. */
export function isDeclaredRoofTrace(value:unknown):value is ReturnType<typeof distributeDeclaredRoofActions>{
  if(!value||typeof value!=="object")return false;
  const v=value as Record<string,unknown>;
  return v.schema_version==="jpn.roof-load-path/1"&&v.declaredGeometry===true&&
    v.computedStructuralApproval===false&&v.fabricationRelease===false&&
    Array.isArray(v.actions)&&typeof v.method==="object"&&v.method!==null;
}
type V=[number,number,number];
type MemberMapping={members:readonly {id:string;originalId:string}[]};
const zero=():V=>[0,0,0];
const add=(a:V,b:V)=>{for(let i=0;i<3;i++)a[i]+=b[i];};
const plus=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:V,k:number):V=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(a:V)=>Math.hypot(...a);
function fail(code:string,message:string):never{throw Error(code+": "+message);}
const same=(a:V,b:V,scale=1)=>length(sub(a,b))<=1e-8*Math.max(scale,length(a),length(b),1);

/** M40: independently prove that real PyNite reactions balance ALL declared
 * global nodal, distributed and self-weight actions (including combinations),
 * while tracing roof-area loads and declared physical support interfaces.
 * No structural capacity, release, fixture or normative factors are inferred. */
export async function auditPhysicalRoofReactionPath(
  project:Project,
  rawRequest:unknown,
  rawResult:unknown,
  roofTrace:ReturnType<typeof distributeDeclaredRoofActions>,
  mapping:MemberMapping
){
  const draft=project.workspace.spatialPreparation;
  if(!project.workspace.physicalStructure||!draft?.physicalRoofFaces||!draft.loading)
    fail("M40_PHYSICAL_ROOF_PENDING","estrutura, pano e cargas físicas devem existir");
  const request=loadedMixedRequestSchema.parse(rawRequest),
    result=loadedMixedResultSchema.parse(rawResult);
  if(request.project.id!==project.id)
    fail("M40_PROJECT_MISMATCH","resultado não pertence ao projeto físico declarado");
  const sha=await mixedInputHash(request);
  if(result.input_sha256!==sha)
    fail("M40_STALE_RESULT","resposta do PyNite não corresponde ao hash da solicitação");
  verifyMixedResult(request,result,sha);
  verifyLoadingTrace(request,result);
  const signature=declaredRoofDistributionSignature(project);
  if(roofTrace.method.geometrySignature!==signature)
    fail("M40_STALE_ROOF","pano, terças ou proveniência mudaram após o carregamento");
  if(canonicalSpatialInput(draft.loading.roofArea)!==
    canonicalSpatialInput(roofTrace.actions.map(a=>a.action)))
    fail("M40_STALE_ACTIONS","as ações declaradas diferem do caminho de cargas analisado");
  if(request.member_loads.some(l=>l.coordinate_system!=="global"))
    fail("M40_LOCAL_LOAD_PENDING","sistemas locais de barras exigem transformação auditada antes de conferir os momentos globais");
  const nodes=new Map(request.nodes.map(n=>[n.id,[n.x_m,n.y_m,n.z_m] as V])),
    members=new Map(request.members.map(m=>[m.id,m]));
  const physicalModel=resolvePhysicalStructure(project).model!;
  const physicalMembers=new Map(physicalModel.pieces.map(p=>[p.id,p]));
  const memberLengths=new Map<string,number>();
  for(const m of request.members){
    const a=nodes.get(m.start),b=nodes.get(m.end);
    if(!a||!b)fail("M40_MISSING_NODE",m.id+" possui extremo inexistente");
    memberLengths.set(m.id,length(sub(b,a)));
  }
  if(new Set(mapping.members.map(m=>m.id)).size!==request.members.length||
    mapping.members.some(m=>!members.has(m.id))||
    request.members.some(m=>!mapping.members.find(v=>v.id===m.id)))
    fail("M40_MEMBER_MAPPING","segmentação incompleta ou não vinculada à requisição");
  const fromRoof=new Map<string,true>();
  for(const action of roofTrace.actions){
    let computedForce=zero(),computedMoment=zero();
    for(const load of action.loads){
      const original=physicalMembers.get(load.pieceId);
      if(!original||original.role!=="purlin")
        fail("M40_PURLIN_MISMATCH",load.pieceId+" não é terça física");
      const segments=mapping.members.filter(m=>m.originalId===load.pieceId);
      if(!segments.length)fail("M40_UNMAPPED_PURLIN",load.pieceId+" sem elemento no solver");
      const span=segments.reduce((s,m)=>s+memberLengths.get(m.id)!,0);
      if(Math.abs(span-original.lengthMm/1000)>1e-8*Math.max(1,span))
        fail("M40_LOST_MEMBER_LENGTH",load.pieceId+" perdeu comprimento na discretização");
      for(const segment of segments){
        const key=action.actionId+":"+segment.id;
        const actual=request.member_loads.find(l=>l.id===key);
        if(!actual||actual.case!==action.action.caseId||actual.member!==segment.id||
          actual.coordinate_system!=="global"||
          !same(actual.force_per_length_n_m,load.forcePerLengthNM)||
          actual.source!==action.action.source||actual.revision!==action.action.revision)
          fail("M40_LOAD_TRACE_MISMATCH",key+" não conserva a carga na terça do solver");
        if(fromRoof.has(key))fail("M40_DUPLICATE_LOAD_TRACE",key+" repetido");
        fromRoof.set(key,true);
        const m=members.get(segment.id)!,
          start=nodes.get(m.start)!,end=nodes.get(m.end)!,
          f=mul(actual.force_per_length_n_m,memberLengths.get(segment.id)!),
          midpoint=mul(plus(start,end),.5);
        add(computedForce,f);add(computedMoment,cross(midpoint,f));
      }
    }
    if(!same(computedForce,action.expectedForceN)||!same(computedMoment,action.expectedMomentNm))
      fail("M40_ROOF_RESULTANT_MISMATCH",action.action.caseId+" perdeu força/momento entre telha e elementos reais");
  }
  const actualRoofLoads=request.member_loads.filter(l=>l.id.startsWith("AREA-"));
  if(actualRoofLoads.some(l=>!fromRoof.has(l.id)))
    fail("M40_UNTRACED_AREA_LOAD","carga marcada como ação de área sem cobertura física correspondente");
  const interfaces=draft.supportInterfaces??[],
    interfaceByNode=new Map(interfaces.map(x=>[x.nodeId,x])),
    supportNodes=new Set(request.supports.map(s=>s.node)),
    currentModel=resolvePhysicalStructure(project).model!,
    issues=reviewSupportInterfaces(project,draft,currentModel).map(x=>x.code+": "+x.message);
  for(const support of request.supports){
    const declared=draft.supports.find(s=>s.nodeId===support.node),
      physical=interfaceByNode.get(support.node);
    if(!declared||declared.dofs.some((d,i)=>(d==="fixed")!==support.restrained[i]))
      fail("M40_SUPPORT_DOF_MISMATCH",support.node+" alterou vínculos entre cadastro e solver");
    if(!physical)issues.push("M40_UNMAPPED_SUPPORT: "+support.node+" sem interface física");
    else if(physical.dofs.some((d,i)=>(d==="fixed")!==support.restrained[i]))
      fail("M40_STALE_SUPPORT_INTERFACE",support.node+" possui restrições físicas distintas do solver");
  }
  if(interfaces.some(face=>!supportNodes.has(face.nodeId)))
    fail("M40_ORPHAN_SUPPORT_INTERFACE","interface não corresponde a nenhum apoio do modelo analisado");
  const supportAudits=assessSupportReactions(interfaces,result),
    combinations=request.combinations.map(combo=>{
      const solved=result.combinations[combo.id];
      if(!solved)fail("M40_MISSING_COMBINATION",combo.id);
      const appliedForceN=zero(),appliedMomentNm=zero();
      const addAction=(location:V,force:V,explicitMoment:V=zero())=>{
        add(appliedForceN,force);add(appliedMomentNm,plus(explicitMoment,cross(location,force)));
      };
      for(const load of request.nodal_loads){
        const factor=combo.factors[load.case]??0;
        if(!factor)continue;
        const at=nodes.get(load.node);
        if(!at)fail("M40_LOAD_ORPHAN",load.node);
        addAction(at,mul([load.fx_n,load.fy_n,load.fz_n],factor),
          mul([load.mx_nm,load.my_nm,load.mz_nm],factor));
      }
      for(const load of request.member_loads){
        const factor=combo.factors[load.case]??0;
        if(!factor)continue;
        const member=members.get(load.member);
        if(!member)fail("M40_LOAD_MEMBER_ORPHAN",load.member);
        const a=nodes.get(member.start)!,b=nodes.get(member.end)!;
        addAction(mul(plus(a,b),.5),
          mul(load.force_per_length_n_m,(memberLengths.get(member.id)??0)*factor));
      }
      if(request.self_weight){
        const sw=request.self_weight,factor=combo.factors[sw.case]??0;
        if(factor)for(const density of sw.densities){
          const member=members.get(density.member);
          if(!member)fail("M40_WEIGHT_MEMBER_ORPHAN",density.member);
          const section=member.kind==="frame"?
            request.sections.find(x=>x.id===member.section):null;
          const area=member.kind==="axial"?member.area_m2:section?.area_m2;
          if(!area||area<=0)fail("M40_MISSING_PHYSICAL_AREA",member.id);
          const a=nodes.get(member.start)!,b=nodes.get(member.end)!,
            mass=density.kg_m3*area*memberLengths.get(member.id)!;
          addAction(mul(plus(a,b),.5),mul(sw.gravity_m_s2,mass*factor));
        }
      }
      const supportForceN=zero(),supportMomentNm=zero();
      const reactions=request.supports.map(s=>{
        const node=solved.nodes[s.node],location=nodes.get(s.node);
        if(!node||!location)fail("M40_REACTION_ORPHAN",s.node);
        const f=node.reaction_force_n,m=node.reaction_moment_nm;
        add(supportForceN,f);add(supportMomentNm,plus(m,cross(location,f)));
        const face=interfaceByNode.get(s.node);
        return {nodeId:s.node,side:face?.side??null,kind:face?.kind??null,
          source:face?.source??null,revision:face?.revision??null,
          reviewStatus:face?.reviewStatus??"unmapped" as const,
          reactionForceN:f,reactionMomentNm:m,
          capacityStatus:supportAudits.find(v=>v.combinationId===combo.id&&v.nodeId===s.node)?.status??"unmapped",
          normativeApproval:false as const};
      });
      const forceResidualN=plus(appliedForceN,supportForceN),
        momentResidualNm=plus(appliedMomentNm,supportMomentNm),
        forceScale=Math.max(1,length(appliedForceN)+length(supportForceN)),
        momentScale=Math.max(1,length(appliedMomentNm)+length(supportMomentNm));
      if(length(forceResidualN)>1e-7*forceScale)
        fail("M40_FORCE_IMBALANCE",combo.id+": reações não equilibram as forças declaradas");
      if(length(momentResidualNm)>1e-7*momentScale)
        fail("M40_MOMENT_IMBALANCE",combo.id+": reações não equilibram os momentos declarados");
      return {combinationId:combo.id,appliedForceN,appliedMomentNm,
        supportForceN,supportMomentNm,forceResidualN,momentResidualNm,reactions,
        solverRelativeResidual:solved.equilibrium.relative_residual};
    });
  if(issues.length===0&&interfaces.some(i=>i.reviewStatus==="hypothesis"))
    issues.push("M40_SUPPORT_REVIEW_PENDING: apoio registrado apenas como hipótese.");
  return {schema_version:"jpn.physical-roof-reaction-audit/1" as const,
    status:issues.length?"support-review-pending" as const:"reaction-path-verified" as const,
    inputSha256:sha,roofBasis:signature,combinations,issues,supportAudits,
    computedStructuralApproval:false as const,fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,
    limitations:["Conserva resultantes e identifica apoio físico; não calcula resistência de alvenaria, concreto, base, chumbador ou fundação.",
      "Não substitui os controles normativos de vento, segunda ordem, estabilidade ou dimensionamento dos perfis.",
      "A existência de reação no solver não prova que a obra existente suporta o esforço."]};
}
