import { expect,it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { extractContinuousDemands,polynomial,polynomialRoots01 } from "./continuous-demands";
import { mixedInputHash } from "./mixed-analysis";
import { anyMixedRequestSchema } from "./structural-loading";
import type { DemandInput } from "./member-demands";

const source="Independent analytical first-order control; not normative",free=[false,false,false,false,false,false];
async function fixture(mode="propped",segmented=false,rotation=0,global=false,version=2,inclined=false){
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

it("isola raízes repetidas, limites, escalas e polinômio nulo sem falsos extremos",()=>{
  expect(polynomialRoots01([0,0,0])).toEqual([]);expect(polynomialRoots01([.25,-1,1])).toEqual([.5]);
  for(const scale of [1e-20,1,1e20]){const roots=polynomialRoots01([-.08,.66,-1.5,1].map(x=>x*scale));expect(roots).toHaveLength(3);roots.forEach((r,i)=>expect(r).toBeCloseTo([.2,.5,.8][i],12));}
});
it.each([false,true])("viga propped: máximo entre amostras e flecha quartica independente; segmentada=%s",async segmented=>{
  const f=await fixture("propped",segmented),r=await extractContinuousDemands(f.prepared,f.result,f.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!,rows=p.fields.flatMap(f=>f.rows).filter(r=>r.combinationId==="POS");
  expect(rows.some(r=>Math.abs(r.originalPositionM-2.5)<1e-10)).toBe(true);
  const xDef=(15-Math.sqrt(33))*4/16;expect(rows.some(r=>Math.abs(r.originalPositionM-xDef)<1e-10)).toBe(true);
  for(const row of rows){const x=row.originalPositionM;expect(row.forces.nN).toBeCloseTo(1234+40*(4-x),6);expect(row.forces.tNm).toBeCloseTo(20,6);expect(row.forces.mzNm!).toBeCloseTo(-100*(x*x/2-5*4*x/8+4*4/8),6);expect(row.forces.myNm!).toBeCloseTo(70*(x*x/2-5*4*x/8+4*4/8),6);expect(row.translationLocalM![1]).toBeCloseTo(-100*(x**4/24-5*4*x**3/48+4**2*x*x/16)/(200e9*1e-5),11);}
  if(segmented){const cut=rows.filter(r=>Math.abs(r.originalPositionM-1.3)<1e-12);expect(cut).toHaveLength(2);expect(new Set(cut.map(r=>r.segmentId)).size).toBe(2);}
  expect(r.interactionStatus).toBe("unsupported");expect(r.approvedForFabrication).toBe(false);
},20000);
it.each(["simple","cantilever"])("referência %s, seção girada e cargas globais/locais, sinais e concomitância",async mode=>{
  const [a,b]=await Promise.all([fixture(mode,false,37,false),fixture(mode,false,37,true)]),r=await extractContinuousDemands(a.prepared,a.result,a.trace),s=await extractContinuousDemands(b.prepared,b.result,b.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!;
  for(const field of p.fields){const factor=field.combinationId==="POS"?1:-2;for(const row of field.rows){const x=row.segmentPositionM;const expected=mode==="simple"?100*x*(4-x)/2:-100*(4-x)**2/2;expect(row.forces.mzNm!).toBeCloseTo(factor*expected,6);expect(row.forces.myNm!).toBeCloseTo(-.7*factor*expected,6);expect(row.forces.nN).toBeCloseTo(factor*(1234+40*(4-x)),6);}
    const other=s.pieces.find(p=>p.pieceId==="BEAM")!.fields.find(f=>f.combinationId===field.combinationId)!;for(const k of ["nN","vyN","vzN","tNm","myNm","mzNm"] as const)for(const u of [.13,.49,.81])expect(polynomial(field.forcePolynomials[k]!,u)).toBeCloseTo(polynomial(other.forcePolynomials[k]!,u),7);
  }
  if(mode==="simple"){const field=p.fields[0];expect(polynomial(field.displacementPolynomials![1],.5)).toBeCloseTo(-5*100*4**4/(384*200e9*1e-5),11);}
},20000);
it("legacy v1 mantém esforços contínuos nodais e deslocamentos unsupported; corrupção bloqueada",async()=>{
  const f=await fixture("cantilever",false,0,false,1),r=await extractContinuousDemands(f.prepared,f.result,f.trace);expect(r.pieces[0].fields[0].displacementStatus).toBe("unsupported");
  const bad=structuredClone(f.trace);bad.members.F.global_to_local[1][0]=.1;await expect(extractContinuousDemands(f.prepared,f.result,bad)).rejects.toThrow();
  const v=await fixture();v.result.combinations.POS.members.F.stations[1].mz_nm+=10;await expect(extractContinuousDemands(v.prepared,v.result,v.trace)).rejects.toThrow(/CONTINUOUS_FIELD_MISMATCH/);
},20000);
it("balanço espacial inclinado, seção girada 37° e vetor concomitante em posições não amostradas",async()=>{
  const f=await fixture("cantilever",false,37,false,2,true),r=await extractContinuousDemands(f.prepared,f.result,f.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!;
  for(const field of p.fields){const factor=field.combinationId==="POS"?1:-2;for(const x of [.37,1.41,3.19]){const u=x/4;expect(polynomial(field.forcePolynomials.nN!,u)).toBeCloseTo((1234+40*(4-x))*factor,6);expect(polynomial(field.forcePolynomials.tNm!,u)).toBeCloseTo(20*factor,6);expect(polynomial(field.forcePolynomials.mzNm!,u)).toBeCloseTo(-100*factor*(4-x)**2/2,6);expect(polynomial(field.forcePolynomials.myNm!,u)).toBeCloseTo(70*factor*(4-x)**2/2,6);expect(polynomial(field.displacementPolynomials![1],u)).toBeCloseTo(-100*factor*x*x*(6*16-16*x+x*x)/(24*200e9*1e-5),11);}}
},20000);

it("liberações flexionais nativas preservam a curva contínua e momentos liberados nulos",async()=>{
  const f=await fixture("released"),r=await extractContinuousDemands(f.prepared,f.result,f.trace),field=r.pieces.find(p=>p.pieceId==="BEAM")!.fields[0];
  expect(polynomial(field.forcePolynomials.mzNm!,1)).toBeCloseTo(0,7);expect(polynomial(field.forcePolynomials.myNm!,1)).toBeCloseTo(0,7);
  expect(polynomial(field.forcePolynomials.mzNm!,2.5/4)).toBeCloseTo(112.5,6);
  const x=(15-Math.sqrt(33))*4/16;expect(polynomial(field.displacementPolynomials![1],x/4)).toBeCloseTo(-100*(x**4/24-5*4*x**3/48+16*x*x/16)/(200e9*1e-5),11);
},20000);
