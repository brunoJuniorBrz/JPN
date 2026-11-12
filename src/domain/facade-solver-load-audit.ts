import type {Project} from "./models";
import type {loadedMixedRequestSchema} from "./structural-loading";
import type {z} from "zod";
import {canonicalSpatialInput} from "./spatial-analysis";
import {resolvePhysicalStructure} from "./physical-structure";
import {distributeDeclaredFacadeTractions} from "./declared-facade-traction";

type V=[number,number,number];
type Request=z.infer<typeof loadedMixedRequestSchema>;
type Trace=ReturnType<typeof distributeDeclaredFacadeTractions>;
type MemberMapping={members:readonly {id:string;originalId:string}[]};
const zero=():V=>[0,0,0];
const add=(a:V,b:V)=>{for(let i=0;i<3;i++)a[i]+=b[i];};
const minus=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const plus=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const times=(a:V,k:number):V=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=(a:V)=>Math.hypot(...a);
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function fail(code:string,message:string):never{throw Error(code+": "+message);}
const same=(a:V,b:V)=>length(minus(a,b))<=1e-9*Math.max(1,length(a),length(b));

/** Audit the REAL members receiving externally supplied facade pressure.
 * Independent of PyNite, but verifies its exact request and all three global
 * moments against the measured wall. No pressure coefficient is invented.
 *
 * A solver member mapping is permitted to split a real column only if those
 * segments form a gap-free, non-overlapping partition of the ORIGINAL piece.
 */
export function auditFacadeSolverLoads(
  project:Project,trace:Trace,request:Request,mapping:MemberMapping
){
  if(!project.workspace.physicalStructure||
    !project.workspace.spatialPreparation?.physicalFacades)
    fail("FACADE_AUDIT_GEOMETRY_REQUIRED","faltam a estrutura e fachadas físicas");
  const current=distributeDeclaredFacadeTractions(project,trace.source);
  if(canonicalSpatialInput(current)!==canonicalSpatialInput(trace))
    fail("FACADE_AUDIT_STALE_TRACE","zonas, geometria, áreas ou forças do cenário foram alteradas");
  if(request.project.id!==project.id)
    fail("FACADE_AUDIT_PROJECT_MISMATCH","requisição do solver não corresponde à obra");
  const physical=resolvePhysicalStructure(project).model;
  if(!physical)fail("FACADE_AUDIT_PHYSICAL_MODEL","modelo físico incompleto");
  const physicalNodes=new Map(physical.nodes.map(n=>[n.id,[n.x/1000,n.y/1000,n.z/1000] as V])),
    physicalPieces=new Map(physical.pieces.map(p=>[p.id,p])),
    solverNodes=new Map(request.nodes.map(n=>[n.id,[n.x_m,n.y_m,n.z_m] as V])),
    solverMembers=new Map(request.members.map(m=>[m.id,m]));
  const used=new Set<string>();
  const auditedCases=trace.cases.map(c=>{
    const auditedZones=c.zones.map(zone=>{
      const f=zero(),m=zero(),mappedMembers:string[]=[];
      for(const contribution of zone.contributions){
        const piece=physicalPieces.get(contribution.pieceId);
        if(!piece||piece.role!=="column")
          fail("FACADE_AUDIT_COLUMN_MISSING",contribution.pieceId);
        const a=physicalNodes.get(piece.start),b=physicalNodes.get(piece.end);
        if(!a||!b)fail("FACADE_AUDIT_NODES_MISSING",piece.id);
        const vector=minus(b,a),L=length(vector),squared=dot(vector,vector);
        if(L<=1e-8)fail("FACADE_AUDIT_COLUMN_LENGTH",piece.id);
        const segments=mapping.members.filter(x=>x.originalId===piece.id);
        if(!segments.length)fail("FACADE_AUDIT_UNMAPPED_COLUMN",piece.id);
        const intervals=segments.map(segment=>{
          const member=solverMembers.get(segment.id);
          if(!member||member.kind!=="frame")
            fail("FACADE_AUDIT_FRAME_REQUIRED",segment.id);
          const start=solverNodes.get(member.start),end=solverNodes.get(member.end);
          if(!start||!end)fail("FACADE_AUDIT_SOLVER_NODE",member.id);
          const projectParameter=(point:V)=>{
            const relative=minus(point,a),t=dot(relative,vector)/squared;
            if(t < -1e-8||t > 1+1e-8||
              length(minus(relative,times(vector,t)))>1e-7*Math.max(1,L))
              fail("FACADE_AUDIT_OFF_AXIS",member.id+" não está sobre o pilar real");
            return t;
          };
          const t0=projectParameter(start),t1=projectParameter(end);
          const lo=Math.min(t0,t1),hi=Math.max(t0,t1),span=length(minus(end,start));
          if(hi-lo<=1e-10||Math.abs((hi-lo)*L-span)>1e-8*Math.max(1,L))
            fail("FACADE_AUDIT_SEGMENT_LENGTH",member.id+" tem intervalo físico incompatível");
          const key="FACADE:"+c.caseId+":"+zone.facadeId+":"+member.id;
          if(used.has(key))fail("FACADE_AUDIT_DUPLICATE_SEGMENT",key);
          const actual=request.member_loads.find(load=>load.id===key);
          if(!actual||actual.case!==c.caseId||actual.member!==member.id||
            actual.coordinate_system!=="global"||
            actual.source!==zone.source||actual.revision!==zone.revision||
            !same(actual.force_per_length_n_m,contribution.forcePerLengthNM))
            fail("FACADE_AUDIT_LOAD_MISMATCH",key+" não conserva pressão na barra global");
          used.add(key);mappedMembers.push(member.id);
          const force=times(actual.force_per_length_n_m,span),
            midpoint=times(plus(start,end),.5);
          add(f,force);add(m,cross(midpoint,force));
          return {lo,hi,id:member.id};
        }).sort((x,y)=>x.lo-y.lo);
        let cursor=0;
        for(const interval of intervals){
          if(Math.abs(interval.lo-cursor)>1e-8)
            fail("FACADE_AUDIT_SEGMENTATION","lacuna ou sobreposição no pilar "+piece.id);
          cursor=interval.hi;
        }
        if(Math.abs(cursor-1)>1e-8)
          fail("FACADE_AUDIT_SEGMENTATION","parte do pilar "+piece.id+" ausente no modelo numérico");
      }
      if(!same(f,zone.expectedForceN)||!same(m,zone.expectedMomentNm))
        fail("FACADE_AUDIT_FORCE_MOMENT","resultantes transmitidas não conservam os seis esforços da fachada "+zone.facadeId);
      return {facadeId:zone.facadeId,expectedForceN:zone.expectedForceN,
        expectedMomentNm:zone.expectedMomentNm,transmittedForceN:f,
        transmittedMomentNm:m,mappedMembers};
    });
    return {caseId:c.caseId,facades:auditedZones};
  });
  const rogue=request.member_loads.find(l=>l.id.startsWith("FACADE:")&&!used.has(l.id));
  if(rogue)fail("FACADE_AUDIT_UNTRACED_LOAD",rogue.id+" não corresponde à fachada física revisada");
  return {schema_version:"jpn.facade-solver-load-audit/1" as const,
    cases:auditedCases,physicalSource:trace.source,verified:true as const,
    normativeWindValidated:false as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,
    limitations:["A verificação conserva carregamentos em barras reais, não a resistência das chapas, fixações ou dos apoios.",
      "A pressão é declarada externamente; coeficientes e combinações ABNT continuam pendentes."]};
}
