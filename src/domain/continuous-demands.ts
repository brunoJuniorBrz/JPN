import { extractMemberDemands,type DemandInput,type DemandForces,demandComponents } from "./member-demands";
import { anyMixedRequestSchema,anyMixedResultSchema } from "./structural-loading";
import { verifyJointActionTrace,type V3 } from "./member-end-actions";
import { mixedInputHash } from "./mixed-analysis";

// Recovery only, never stiffness assembly. Coefficients use u=x/L in [0,1].
export const polynomial=(c:number[],u:number)=>c.reduceRight((s,a)=>s*u+a,0);
const derivative=(c:number[])=>c.slice(1).map((a,i)=>a*(i+1));
export function polynomialRoots01(input:number[]):number[]{
  if(input.some(x=>!Number.isFinite(x)))throw Error("CONTINUOUS_NONFINITE");
  const c=[...input],eps=64*Number.EPSILON*c.reduce((s,x)=>s+Math.abs(x),0);
  while(c.length>1&&Math.abs(c.at(-1)!)<=eps)c.pop();
  if(c.length<2)return []; // constant/zero: endpoints suffice
  const cuts=[0,...polynomialRoots01(derivative(c)),1].sort((a,b)=>a-b),roots:number[]=[];
  for(const x of cuts)if(Math.abs(polynomial(c,x))<=eps)roots.push(x);
  for(let i=1;i<cuts.length;i++){
    let a=cuts[i-1],b=cuts[i],fa=polynomial(c,a);const fb=polynomial(c,b);
    if(fa===0||fb===0||Math.sign(fa)===Math.sign(fb))continue;
    for(let k=0;k<60;k++){const m=(a+b)/2,f=polynomial(c,m);if(m===a||m===b)break;if(f===0){a=b=m;break;}if(Math.sign(f)===Math.sign(fa)){a=m;fa=f;}else b=m;}
    roots.push((a+b)/2);
  }
  return [...new Set(roots)].filter(x=>x>0&&x<1);
}
const close=(a:number,b:number,absolute=1e-7)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=absolute+1e-9*Math.max(Math.abs(a),Math.abs(b));

/** Exact first-order fields for the currently supported full-span uniform
 * translational member loads. No point/partial/linear loads, P-delta, warping
 * or interaction extrema are inferred. Deflection follows integrated native
 * end actions and actual endpoint translations; five samples only CHECK it. */
export async function extractContinuousDemands(prepared:DemandInput,value:unknown,sidecar:unknown){
  const sampled=await extractMemberDemands(prepared,value),request=anyMixedRequestSchema.parse(prepared.request),result=anyMixedResultSchema.parse(value);
  const trace=verifyJointActionTrace(request,result,sidecar);
  const pieces=sampled.pieces.map(piece=>{
    const fields=piece.segments.flatMap(segment=>request.combinations.map(combo=>{
      const m=request.members.find(m=>m.id===segment.id)!,response=result.combinations[combo.id].members[m.id],L=response.length_m;
      const q:V3=[0,0,0],R=trace.members[m.id].global_to_local;
      const addLoad=(v:V3,coordinates:"local"|"global",factor:number)=>{const local=coordinates==="local"?v:R.map(row=>row.reduce((s,x,i)=>s+x*v[i],0));local.forEach((x,i)=>q[i]+=x*factor);};
      if(request.schema_version==="jpn.mixed3d/2"){
        for(const l of request.member_loads)if(l.member===m.id)addLoad(l.force_per_length_n_m,l.coordinate_system,combo.factors[l.case]??0);
        if(result.schema_version==="jpn.mixed3d-result/2"&&result.loading.self_weight){const sw=result.loading.self_weight,w=sw.members.find(w=>w.member===m.id);if(w?.representation==="consistent-frame-udl")addLoad(w.force_n.map(x=>x/L) as V3,"global",combo.factors[sw.case]??0);}
      }
      const a=response.kind==="frame"?response.end_actions_local:null;
      const forcePolynomials:Record<keyof DemandForces,number[]|null>=a?{nN:[-a[0],-q[0]*L],vyN:[-a[1],-q[1]*L],vzN:[-a[2],-q[2]*L],tNm:[-a[3]],myNm:[-a[4],-a[2]*L,-q[2]*L*L/2],mzNm:[-a[5],a[1]*L,q[1]*L*L/2]}:{nN:[response.kind==="axial"?response.axial_n:NaN],vyN:null,vzN:null,tNm:null,myNm:null,mzNm:null};
      const samples=piece.samples.filter(s=>s.segmentId===segment.id&&s.combinationId===combo.id);
      for(const s of samples)for(const k of demandComponents){const c=forcePolynomials[k];if(c&&!close(polynomial(c,s.segmentPositionM/L),s.forces[k]!))throw Error("CONTINUOUS_FIELD_MISMATCH: cargas, eixos ou esforços inconsistentes.");}
      if(a)for(let k=0;k<6;k++){const end=polynomial(forcePolynomials[demandComponents[k]]!,1);if(!close(end,a[k+6]))throw Error("CONTINUOUS_END_MISMATCH");}
      let displacementPolynomials:number[][]|null=null;
      if(a&&m.kind==="frame"&&samples.every(s=>s.translationLocalM!==null)){
        const mat=request.materials.find(x=>x.id===m.material)!,s=request.sections.find(x=>x.id===m.section)!;
        const local=(node:string)=>R.map(row=>row.reduce((sum,x,i)=>sum+x*result.combinations[combo.id].nodes[node].translation_m[i],0));
        const start=local(m.start),end=local(m.end),EA=mat.e_pa*s.area_m2,EIy=mat.e_pa*s.iy_m4,EIz=mat.e_pa*s.iz_m4;
        const transverse=(i:number,c2:number,c3:number,c4:number)=>[start[i],end[i]-start[i]-c2-c3-c4,c2,c3,c4];
        displacementPolynomials=[[start[0],-a[0]*L/EA,-q[0]*L*L/(2*EA)],transverse(1,-a[5]*L*L/(2*EIz),a[1]*L**3/(6*EIz),q[1]*L**4/(24*EIz)),transverse(2,a[4]*L*L/(2*EIy),a[2]*L**3/(6*EIy),q[2]*L**4/(24*EIy))];
        if(displacementPolynomials.some((c,i)=>!close(polynomial(c,1),end[i],1e-12))||samples.some(s=>displacementPolynomials!.some((c,i)=>!close(polynomial(c,s.segmentPositionM/L),s.translationLocalM![i],1e-12))))throw Error("CONTINUOUS_DISPLACEMENT_MISMATCH");
      }
      const chordRelativePolynomials=displacementPolynomials?.map(c=>{const a=polynomial(c,0),b=polynomial(c,1),p=[...c];p[0]-=a;p[1]-=b-a;return p;})??null;
      const candidates=new Set([0,1]);for(const c of Object.values(forcePolynomials))if(c)for(const root of polynomialRoots01(derivative(c)))candidates.add(root);
      for(const c of [...(displacementPolynomials??[]),...(chordRelativePolynomials??[])])for(const root of polynomialRoots01(derivative(c)))candidates.add(root);
      const rows=[...candidates].sort((a,b)=>a-b).map(u=>({id:JSON.stringify([piece.pieceId,m.id,combo.id,u]),pieceId:piece.pieceId,segmentId:m.id,combinationId:combo.id,segmentPositionM:u*L,originalPositionM:segment.t0*piece.lengthM+u*L,originalFraction:segment.t0+u*(segment.t1-segment.t0),side:u===0?"start":u===1?"end":"interior",forces:Object.fromEntries(demandComponents.map(k=>[k,forcePolynomials[k]?polynomial(forcePolynomials[k]!,u):null])) as DemandForces,translationLocalM:displacementPolynomials?.map(c=>polynomial(c,u))??null,chordRelativeLocalM:chordRelativePolynomials?.map(c=>polynomial(c,u))??null}));
      const displacementExtrema=(key:"translationLocalM"|"chordRelativeLocalM")=>rows[0][key]?[0,1,2].map(i=>({minimum:rows.reduce((a,b)=>b[key]![i]<a[key]![i]?b:a).id,maximum:rows.reduce((a,b)=>b[key]![i]>a[key]![i]?b:a).id,absolute:rows.reduce((a,b)=>Math.abs(b[key]![i])>Math.abs(a[key]![i])?b:a).id})):null;
      return {segmentId:m.id,combinationId:combo.id,lengthM:L,loadLocalNM:q,globalToLocal:R,forcePolynomials,displacementPolynomials,chordRelativePolynomials,rows,translationExtrema:displacementExtrema("translationLocalM"),chordRelativeExtrema:displacementExtrema("chordRelativeLocalM"),displacementStatus:displacementPolynomials?"continuous-verified":"unsupported"};
    }));
    const rows=fields.flatMap(f=>f.rows),extrema=Object.fromEntries(demandComponents.map(k=>{const applicable=rows.filter(r=>r.forces[k]!==null);return [k,applicable.length?{minimum:applicable.reduce((a,b)=>b.forces[k]!<a.forces[k]!?b:a).id,maximum:applicable.reduce((a,b)=>b.forces[k]!>a.forces[k]!?b:a).id,absolute:applicable.reduce((a,b)=>Math.abs(b.forces[k]!)>Math.abs(a.forces[k]!)?b:a).id}:null];}));
    const displacements=fields.every(f=>f.displacementStatus==="continuous-verified");
    return {pieceId:piece.pieceId,kind:piece.kind,status:"force-components-verified" as const,coverage:{forces:"continuous-verified",localDisplacement:displacements?"continuous-verified":"unsupported",segmentRelativeDeflection:displacements?"continuous-verified":"unsupported",wholePieceDeflection:"unsupported",interactionExtrema:"unsupported"},fields,extrema};
  });
  const report={schema_version:"jpn.continuous-demands/2" as const,units:"SI",binding:{...sampled.binding,traceSha256:await mixedInputHash(trace)},approvedForFabrication:false,method:"First-order full-span UDL: linear force, quadratic moment, constant torsion; native quartic displacement with derivative-root isolation",interactionStatus:"unsupported",displacementScope:"local components and segment chord-relative components; no displacement-vector norm or whole-piece relative reference",pieces};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export type ContinuousDemands=Awaited<ReturnType<typeof extractContinuousDemands>>;
