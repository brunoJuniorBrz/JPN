import { expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { mixedInputHash } from "../mixed-analysis";
import { anyMixedRequestSchema } from "../structural-loading";
import type { DemandInput } from "../member-demands";
const source="Independent analytical first-order control; not normative",free=[false,false,false,false,false,false];
export async function fixture(mode="propped",segmented=false,rotation=0,global=false,version=2,inclined=false){
  const R=[[1,0,0],[0,Math.cos(rotation*Math.PI/180),Math.sin(rotation*Math.PI/180)],[0,-Math.sin(rotation*Math.PI/180),Math.cos(rotation*Math.PI/180)]];
  const q=[40,-100,-70],globalQ=q.map((_,i)=>R.reduce((s,r,j)=>s+r[i]*q[j],0));
  const nodes=[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:4,y_m:0,z_m:0},{id:"D",x_m:0,y_m:1,z_m:0},...(segmented?[{id:"CUT",x_m:1.3,y_m:0,z_m:0}]:[])];
  const frames=(segmented?[["F1","A","CUT"],["F2","CUT","B"]]:[["F","A","B"]]).map(([id,start,end])=>({id,start,end,kind:"frame",material:"M",section:"S",rotation_deg:rotation,release_start:free,release_end:mode==="released"?[false,false,false,false,true,true]:free}));
  if(inclined)for(const n of nodes){const x=n.x_m,y=n.y_m;n.x_m=(2*x-3*y)/Math.sqrt(29);n.y_m=(3*x+2*y)/Math.sqrt(29);n.z_m=4*x/Math.sqrt(29);}
  const direction=inclined?[2,3,4].map(v=>v/Math.sqrt(29)):[1,0,0];
  const request=anyMixedRequestSchema.parse({schema_version:`jpn.mixed3d/${version}`,units:"SI",theory:"linear-elastic-frame-axial",project:{id:"M26",revision:"1",source},nodes,
    members:[...frames,{id:"AX",kind:"axial",start:"A",end:"D",e_pa:200e9,area_m2:.001,source,revision:"1"}],materials:[{id:"M",e_pa:200e9,g_pa:200e9/2.6,nu:.3,source,revision:"1"}],sections:[{id:"S",area_m2:.01,iy_m4:2e-5,iz_m4:1e-5,j_m4:1e-5,source,revision:"1"}],
    supports:[{node:"A",restrained:mode==="simple"?[true,true,true,true,false,false]:[true,true,true,true,true,true]},{node:"D",restrained:[true,true,true,false,false,false]},...(mode!=="cantilever"?[{node:"B",restrained:mode==="released"?[true,true,true,true,true,true]:[false,true,true,false,false,false]}]:[])],
    cases:[{id:"Q",source}],combinations:[{id:"POS",factors:{Q:1}},{id:"NEG",factors:{Q:-2}}],nodal_loads:[{node:"B",case:"Q",fx_n:1234*direction[0],fy_n:1234*direction[1],fz_n:1234*direction[2],mx_nm:20*direction[0],my_nm:20*direction[1],mz_nm:20*direction[2]}],
    ...(version===2?{member_loads:frames.map(m=>({id:m.id,member:m.id,case:"Q",coordinate_system:global?"global":"local",force_per_length_n_m:global?globalQ:q,source,revision:"1"})),self_weight:null}:{}),
  });
  const mapping:DemandInput["mapping"]={schema_version:"jpn.geometry-physical-map/1",units:"mm",geometrySignature:"analytical",junctions:[],nodes:nodes.map(n=>({id:n.id,x:n.x_m*1000,y:n.y_m*1000,z:n.z_m*1000})),members:request.members.map(m=>{const a=nodes.find(n=>n.id===m.start)!,b=nodes.find(n=>n.id===m.end)!,t0=m.id==="F2"?1.3/4:0,t1=m.id==="F1"?1.3/4:1;return {id:m.id,originalId:m.kind==="frame"?"BEAM":"AX",start:m.start,end:m.end,lengthMm:1000*Math.hypot(b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m),t0,t1,originalStart:t0===0,originalEnd:t1===1};})};
  const prepared={request,mapping,input_sha256:await mixedInputHash(request),preparation_sha256:"a".repeat(64)};
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py"),"--joint-actions"],{input:JSON.stringify(request),encoding:"utf8",windowsHide:true,maxBuffer:2000000,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}}));
  expect(out.status).toBe("completed");return {prepared,result:out.result,trace:out.joint_actions};
}

