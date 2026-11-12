import {expect,test} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
import {secondaryFixityShed} from "../../src/domain/test-support/secondary-fixity-project";
import {adaptMixedProject} from "../../src/domain/mixed-adapter";
import {declaredBasis} from "../../src/domain/local-axes";

/** Real Next.js route -> capped Python worker. No mocked response anywhere. */
const E=200e9,A=2e-3,IY=8e-6,IZ=1e-6,SOURCE="C1 HTTP reference; synthetic, not a site model";
const directions:[number,number,number][]=[[4,0,0],[0,4,.8],[3,2,.5],[0,0,4]];
function star(version:2|3,roll:number){
  return {schema_version:`jpn.mixed3d/${version}`,units:"SI",theory:"linear-elastic-frame-axial",project:{id:"C1-HTTP",revision:"1",source:SOURCE},
    nodes:[{id:"A",x_m:0,y_m:0,z_m:5},...directions.map((d,i)=>({id:`B${i}`,x_m:d[0],y_m:d[1],z_m:5+d[2]}))],
    members:directions.map((_,i)=>({id:`M${i}`,start:"A",end:`B${i}`,kind:"frame",material:"S",section:"S",rotation_deg:roll,release_start:Array(6).fill(false),release_end:Array(6).fill(false)})),
    materials:[{id:"S",e_pa:E,g_pa:E/2.6,nu:.3,source:SOURCE,revision:"1"}],sections:[{id:"S",area_m2:A,iy_m4:IY,iz_m4:IZ,j_m4:1e-7,source:SOURCE,revision:"1"}],
    supports:[{node:"A",restrained:Array(6).fill(true)}],cases:[{id:"F",source:SOURCE}],
    nodal_loads:directions.map((_,i)=>({node:`B${i}`,case:"F",fx_n:30,fy_n:-20,fz_n:-100,mx_nm:0,my_nm:0,mz_nm:0})),
    combinations:[{id:"F",factors:{F:1}}],member_loads:[],self_weight:null,...(version===3?{local_axes:"jpn-z-up/1"}:{})};
}

test("C1 over HTTP: /3 matches the closed form in the declared axes; ambiguous /2 publishes nothing",async({page})=>{
  test.setTimeout(90000);
  await page.goto("/demonstracao");
  const origin=new URL(page.url()).origin,post=(data:unknown)=>page.request.post("/api/experimental/mixed3d",{headers:{origin},data});
  const evidence:Record<string,unknown>={};
  for(const roll of [0,30]){
    const response=await post(star(3,roll)),body=await response.json();
    expect(response.status(),JSON.stringify(body).slice(0,500)).toBe(200);
    expect(body.result.schema_version).toBe("jpn.mixed3d-result/3");expect(body.result.local_axes.convention).toBe("jpn-z-up/1");
    for(const [i,d] of directions.entries()){
      const L=Math.hypot(...d),[x,y,z]=declaredBasis([0,0,0],d,roll),F=[30,-20,-100],dot=(a:number[],b:number[])=>a.reduce((s,v,k)=>s+v*b[k],0);
      const tip=[0,1,2].map(k=>dot(F,x)*L/(E*A)*x[k]+dot(F,y)*L**3/(3*E*IZ)*y[k]+dot(F,z)*L**3/(3*E*IY)*z[k]),scale=Math.hypot(...tip);
      body.result.combinations.F.nodes[`B${i}`].translation_m.forEach((v:number,k:number)=>expect(Math.abs(v-tip[k])).toBeLessThanOrEqual(1e-9*scale));
    }
    evidence[`v3-roll-${roll}`]=body;
  }
  const refused=await post(star(2,0)),error=await refused.json();
  expect(refused.status()).toBe(422);expect(error.error.code).toBe("AXIS_CONVENTION_AMBIGUOUS");expect(error.result).toBeUndefined();
  evidence["v2-refusal"]=error;
  await mkdir(".tools/c1-c2-runtime",{recursive:true});await writeFile(".tools/c1-c2-runtime/c1-http.json",JSON.stringify(evidence,null,2));
});

test("C2 over HTTP: stability that rests on inherited purlin fixity is refused; bracing or real hinges change the verdict",async({page})=>{
  test.setTimeout(120000);
  await page.goto("/demonstracao");
  const origin=new URL(page.url()).origin;
  const assess=(project:unknown)=>page.request.post("/api/experimental/structural-assessment",{headers:{origin},data:{schema_version:"jpn.structural-assessment/1",project}});
  const mixed=(data:unknown)=>page.request.post("/api/experimental/mixed3d",{headers:{origin},data});
  // The declared model is a valid, equilibrated FE solution: the route alone would publish it.
  const rigid=secondaryFixityShed({purlinGroup:"rigid"}),declared=await mixed((await adaptMixedProject(rigid)).request),declaredBody=await declared.json();
  expect(declared.status(),JSON.stringify(declaredBody).slice(0,500)).toBe(200);
  expect(declaredBody.result.combinations.C.equilibrium.relative_residual).toBeLessThan(1e-8);
  // The integrated assessment runs the counterfactual and refuses, with no assessment body.
  const dependent=await assess(rigid),dependentBody=await dependent.json();
  expect(dependent.status()).toBe(422);expect(dependentBody.error.code).toBe("STABILITY_DEPENDS_ON_SECONDARY_FIXITY");
  expect(dependentBody.report).toBeUndefined();expect(dependentBody.computedStructuralApproval).toBeUndefined();
  // Real bending hinges: the solver itself refuses the declared model.
  const hinged=await assess(secondaryFixityShed({purlinGroup:"bending-pinned"})),hingedBody=await hinged.json();
  expect(hinged.status()).toBe(422);expect(hingedBody.error.code).toBe("UNSTABLE");
  await mkdir(".tools/c1-c2-runtime",{recursive:true});
  await writeFile(".tools/c1-c2-runtime/c2-http.json",JSON.stringify({declared:declaredBody,dependent:dependentBody,hinged:hingedBody},null,2));
});
