import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";
import { mixedInputHash } from "./mixed-analysis";
import { extractMemberDemands, type DemandInput } from "./member-demands";
import { secondOrderMixedRequestSchema, secondOrderMixedResultSchema } from "./structural-loading";

it("entrega esforços concomitantes e eixos deformados do worker M43 ao extrator de dimensionamento", async () => {
  const source = "Balanço comprimido, solução elástica fechada";
  const release = [false,false,false,false,false,false];
  const ei=200e9*2e-5;
  const k=Math.sqrt(.75)*Math.PI/2;
  const request=secondOrderMixedRequestSchema.parse({
    schema_version:"jpn.mixed3d/3", units:"SI", theory:"linear-elastic-frame-axial",
    local_axes:"jpn-z-up/1", analysis_order:"second-order", solution_mode:"per-combination",
    project:{id:"INT3C",revision:"1",source},
    nodes:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:0,y_m:0,z_m:4}],
    members:[{id:"F",kind:"frame",start:"A",end:"B",material:"M",section:"S",rotation_deg:0,
      release_start:release,release_end:release}],
    materials:[{id:"M",e_pa:200e9,g_pa:200e9/2.6,nu:.3,source,revision:"1"}],
    sections:[{id:"S",area_m2:.01,iy_m4:2e-5,iz_m4:2e-5,j_m4:2e-5,source,revision:"1"}],
    supports:[{node:"A",restrained:[true,true,true,true,true,true]}],
    cases:[{id:"P",source}],combinations:[{id:"ULS",factors:{P:1}}],
    nodal_loads:[{node:"B",case:"P",fx_n:100,fy_n:0,fz_n:-ei*k*k/16,mx_nm:0,my_nm:0,mz_nm:0}],
    member_loads:[],self_weight:null,
  });
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I",path.resolve("engine/local_mixed_worker.py")],{
    input:JSON.stringify(request),encoding:"utf8",windowsHide:true,timeout:20_000,
    env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},
  }));
  const result=secondOrderMixedResultSchema.parse(out.result);
  const prepared:DemandInput={request,input_sha256:await mixedInputHash(request),preparation_sha256:"f".repeat(64),
    mapping:{schema_version:"jpn.geometry-physical-map/1",units:"mm",geometrySignature:"INT3C",junctions:[],
      nodes:request.nodes.map(p=>({id:p.id,x:p.x_m*1000,y:p.y_m*1000,z:p.z_m*1000})),
      members:[{id:"F",originalId:"F",start:"A",end:"B",lengthMm:4000,t0:0,t1:1,originalStart:true,originalEnd:true}]}};
  const demands=await extractMemberDemands(prepared,result);
  const piece=demands.pieces[0], base=piece.samples[0];
  expect(piece.axes?.system).toBe("JPN M43 local xyz");
  expect(piece.samples.map(s=>s.originalPositionM)).toEqual([0,1,2,3,4]);
  expect(base.stationGlobalToLocal).toHaveLength(3);
  expect(base.forces.nN).toBeLessThan(0);
  expect(Math.abs(Math.hypot(base.forces.myNm!,base.forces.mzNm!)/(400*Math.tan(k)/k)-1)).toBeLessThan(.01);
  expect(demands.approvedForFabrication).toBe(false);
  const tampered=structuredClone(result);
  tampered.mesh_subdivisions.F=1;
  await expect(extractMemberDemands(prepared,tampered)).rejects.toThrow("MESH_TRACE");
});
