import { z } from "zod";
import type { anyMixedRequestSchema, anyMixedResultSchema } from "./structural-loading";
const n=z.number().finite(),id=z.string().min(1).max(80),v=z.tuple([n,n,n]);
export type V3=[number,number,number];
export type V6=[number,number,number,number,number,number];
export const jointActionTraceSchema=z.object({schema_version:z.literal("jpn.member-end-actions/1"),units:z.literal("SI"),input_sha256:z.string().regex(/^[a-f0-9]{64}$/),
  members:z.record(id,z.object({kind:z.enum(["frame","axial"]),start:id,end:id,global_to_local:z.tuple([v,v,v])}).strict()),
  combinations:z.record(id,z.object({nodal_loads:z.record(id,z.array(n).length(6)),members:z.record(id,z.discriminatedUnion("kind",[
    z.object({kind:z.literal("frame"),node_on_member_global:z.array(n).length(12)}).strict(),
    z.object({kind:z.literal("axial"),node_on_member_force_n:z.tuple([v,v])}).strict(),
  ])).optional()}).strict()),
}).strict();
export type JointActionTrace=z.infer<typeof jointActionTraceSchema>;
export const cross3=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const add3=(a:V3,b:V3)=>a.forEach((_,i)=>a[i]+=b[i]);
export const scale3=(a:V3,s:number)=>a.map(v=>v*s) as V3;
/** R rows are ACTUAL PyNite local axes in global coordinates: global=Rᵀ local. */
export const toGlobal=(r:[V3,V3,V3],local:V3)=>[0,1,2].map(i=>r.reduce((sum,row,j)=>sum+row[i]*local[j],0)) as V3;
const close=(a:number,b:number)=>Math.abs(a-b)<=1e-7+1e-10*Math.max(Math.abs(a),Math.abs(b));
const same=(a:string[],b:string[])=>a.length===b.length&&a.every(x=>b.includes(x));
function fail(s:string):never{throw new Error(`JOINT_TRACE_INVALID: ${s}`);}

export function verifyJointActionTrace(request:z.infer<typeof anyMixedRequestSchema>,result:z.infer<typeof anyMixedResultSchema>,value:unknown){
  const trace=jointActionTraceSchema.parse(value);
  if(trace.input_sha256!==result.input_sha256||!same(Object.keys(trace.members),request.members.map(m=>m.id))||!same(Object.keys(trace.combinations),request.combinations.map(c=>c.id)))fail("hash/IDs incompatíveis.");
  for(const m of request.members){
    const axes=trace.members[m.id],r=axes.global_to_local,a=request.nodes.find(n=>n.id===m.start)!,b=request.nodes.find(n=>n.id===m.end)!;
    if(axes.kind!==m.kind||axes.start!==m.start||axes.end!==m.end)fail("tipo ou extremos da base incompatíveis.");
    const direction:V3=[b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m],length=Math.hypot(...direction);
    if(length<=0||r[0].some((v,i)=>Math.abs(v-direction[i]/length)>1e-12))fail("eixo x não segue início→fim físico.");
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i].reduce((s,v,k)=>s+v*r[j][k],0)-(i===j?1:0))>1e-12)fail("base não ortonormal.");
    if(Math.abs(r[0].reduce((s,v,i)=>s+v*cross3(r[1],r[2])[i],0)-1)>1e-12)fail("base não dextrógira.");
  }
  for(const combo of request.combinations){
    const c=trace.combinations[combo.id],res=result.combinations[combo.id];
    if(c.members&&!same(Object.keys(c.members),request.members.map(m=>m.id))||!same(Object.keys(c.nodal_loads),request.nodes.map(n=>n.id)))fail("combinação com registros incompletos.");
    const expected=new Map(request.nodes.map(n=>[n.id,[0,0,0,0,0,0]]));
    for(const load of request.nodal_loads){const target=expected.get(load.node)!,factor=combo.factors[load.case]??0;[load.fx_n,load.fy_n,load.fz_n,load.mx_nm,load.my_nm,load.mz_nm].forEach((x,i)=>target[i]+=x*factor);}
    // Only AXIAL weight is nodal. Frame UDL/fixed-end effects already belong
    // to member end actions and must never be added as nodal loads again.
    if(result.schema_version==="jpn.mixed3d-result/2"&&result.loading.self_weight){const sw=result.loading.self_weight;for(const w of sw.members)if(w.representation==="half-to-end-nodes"){
      const m=request.members.find(m=>m.id===w.member)!;for(const node of [m.start,m.end])w.force_n.forEach((x,i)=>expected.get(node)![i]+=x*(combo.factors[sw.case]??0)/2);
    }}
    for(const [node,values]of expected)if(values.some((x,i)=>!close(x,c.nodal_loads[node][i])))fail("cargas nodais compiladas não correspondem às declaradas/peso axial.");
    for(const m of request.members){
      const r=trace.members[m.id].global_to_local,t=c.members?.[m.id],response=res.members[m.id];
      if(response.kind!==m.kind||t&&t.kind!==m.kind)fail("tipo da ação incompatível.");
      if(!t)continue;
      if(t.kind==="frame"&&response.kind==="frame"){
        for(const offset of [0,3,6,9]){const g=toGlobal(r,response.end_actions_local.slice(offset,offset+3) as V3);if(g.some((x,i)=>!close(x,t.node_on_member_global[offset+i])))fail("Rᵀf local difere da ação global nativa.");}
      }else if(t.kind==="axial"&&response.kind==="axial")for(const [end,sign]of [[0,-1],[1,1]]){
        const global=scale3(r[0],sign*response.axial_n);if(global.some((x,i)=>!close(x,t.node_on_member_force_n[end][i])))fail("força axial global incompatível com N e orientação.");
      }
    }
  }
  return trace;
}
