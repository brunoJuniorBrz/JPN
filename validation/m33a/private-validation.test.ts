import { afterAll,expect,it } from "vitest";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { reviewedRoofProject } from "../../src/domain/test-support/m33a-reviewed-fixtures";
import { generateNormativeOrigin,materializeNormativeOriginStudy,normativeEnvelope } from "../../src/domain/normative-origin";
import { loadNormativeOriginFiles } from "../../src/infrastructure/analysis/normative-origin-files";
import { adaptLoadedMixedProject } from "../../src/domain/loaded-mixed-adapter";
import { selfWeightOverlapReviewBasis } from "../../src/domain/structural-loading";
import { runLocalMixed } from "../../src/infrastructure/analysis/local-mixed-runner";
import { calculateWindSpeed } from "../../src/domain/wind-speed";
import { buildEngineReleaseGate } from "../../src/domain/engine-release-gate";

const directory=process.env.JPN_NORMATIVE_DATA_DIR;
if(!directory)throw Error("Set JPN_NORMATIVE_DATA_DIR to licensed private directory outside repository");
const manual=JSON.parse(await readFile(path.join(directory,"manual-oracles.json"),"utf8"));
const extractBytes=await readFile(path.join(directory,"m33a-reviewed-extract.json"));
const extractSha256=createHash("sha256").update(extractBytes).digest("hex");
const records:unknown[]=[];
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const compare=(a:number[],b:number[])=>a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThan(1e-7*Math.max(1,Math.abs(b[i]))));

it.each(["mono","gable"] as const)("private source -> %s zones: hand area/first-moment integrals, signs, directions and scalar combination oracles",async typology=>{
  const {project,input}=reviewedRoofProject(typology),files=await loadNormativeOriginFiles();
  const run=await generateNormativeOrigin(project,input,files);
  expect(run.blockers).toEqual([]);expect(run.state).toBe("DECLARED_UNVERIFIED");expect(run.testOnly).toBe(false);
  const q=calculateWindSpeed(input.speed).dynamicPressurePa;
  for(const [i,c] of run.wind!.distribution.cases.entries()){
    compare(c.forceN.map(v=>v/q),manual[typology][i].forceOverQ);
    compare(c.momentNm.map(v=>v/q),manual[typology][i].momentOverQ);
  }
  const cs=run.batches.flatMap(b=>b.combinations);
  for(const oracle of manual.scalarCombinations){
    const ids=new Set(run.batches.flatMap(b=>b.declaration.combinations.filter(c=>c.purpose===oracle.purpose).map(c=>c.id)));
    const c=cs.find(c=>ids.has(c.id)&&c.factors.G===oracle.gFactor&&Math.abs(c.factors.Q-oracle.qFactor)<1e-14&&Math.abs(c.factors.W0_0-oracle.wFactor)<1e-14)!;
    expect(c).toBeDefined();
    expect(c.factors.G*10+c.factors.Q*20+c.factors.W0_0*30).toBeCloseTo(oracle.expected,10);
  };
  expect(run.procedures.some(p=>p.procedure.startsWith("equivalent-combination:"))).toBe(true);
  const gate=buildEngineReleaseGate(project,{binding:{},continuousDemands:{},wholePieceDeflections:{},serviceChecks:[]});
  expect(gate.status).toBe("NOT_READY_BLOCKED");expect(gate.computedStructuralApproval).toBe(false);expect(gate.fabricationRelease).toBe(false);
  records.push({test:"hand-integrals-and-combination-arithmetic",typology,passed:true,windCases:4,combinationCount:cs.length,
    provenance:"PDF-derived selected coefficients; synthetic geometry/actions; independent closed-form force/moment and scalar oracles",
    state:run.state,signature:run.signature,computedStructuralApproval:false,fabricationRelease:false});
});

for(const typology of ["mono","gable"] as const)for(const purpose of ["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"] as const)
it(`private source -> purlins -> ${typology} ${purpose} -> existing native solver and governing case`,async()=>{
  const {project,input}=reviewedRoofProject(typology);input.purposes=[purpose];
  const files=await loadNormativeOriginFiles(),run=await generateNormativeOrigin(project,input,files);
  expect(run.blockers).toEqual([]);
  const studies=await materializeNormativeOriginStudy(project,input,files,run),values:{combinationId:string;value:number}[]=[];
  let maxResidual=0;
  for(const study of studies.projects){
    const d=study.workspace.spatialPreparation!;
    d.loading!.overlapReview={confirmed:true,source:"SYNTHETIC verification only: G cladding, Q declared use and roof wind are distinct; no self weight present",revision:"1",basis:selfWeightOverlapReviewBasis(d,d.loading!)};
    const a=await adaptLoadedMixedProject(study),out=await runLocalMixed(JSON.stringify(a.request));
    if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw Error(`Native solver failed: ${JSON.stringify(out)}`);
    for(const c of a.request.combinations){
      const solved=out.result.combinations[c.id],force=[0,0,0],moment=[0,0,0],expected=[0,0,0],expectedMoment=[0,0,0];
      for(const w of a.wind_load_path!.cases){const f=c.factors[w.caseId]??0;w.forceN.forEach((v,i)=>expected[i]-=f*v);w.momentNm.forEach((v,i)=>expectedMoment[i]-=f*v);}
      for(const area of a.roof_load_path!.actions){const f=c.factors[area.action.caseId]??0;area.expectedForceN.forEach((v,i)=>expected[i]-=f*v);area.expectedMomentNm.forEach((v,i)=>expectedMoment[i]-=f*v);}
      for(const node of a.request.nodes){const r=solved.nodes[node.id],m=cross([node.x_m,node.y_m,node.z_m],r.reaction_force_n);
        r.reaction_force_n.forEach((v,i)=>force[i]+=v);r.reaction_moment_nm.forEach((v,i)=>moment[i]+=v+m[i]);}
      compare(force,expected);compare(moment,expectedMoment);
      expect(solved.equilibrium.relative_residual).toBeLessThan(1e-8);maxResidual=Math.max(maxResidual,solved.equilibrium.relative_residual);
      values.push({combinationId:c.id,value:force[2]});
    }
  }
  const envelope=await normativeEnvelope(run,purpose,values);
  expect(values.find(v=>v.combinationId===envelope.maximumAbsolute.combinationId)).toEqual(envelope.maximumAbsolute);
  records.push({test:"native-solver-and-envelope",typology,purpose,passed:true,combinations:values.length,maxRelativeResidual:maxResidual,
    signature:run.signature,governing:envelope.maximumAbsolute,computedStructuralApproval:false,fabricationRelease:false});
},20000);

afterAll(async()=>{
  await writeFile("validation/m33a/private-validation-results.json",JSON.stringify({schema_version:"jpn.m33a-private-validation/1",extractSha256,
    notes:"Derived results only. No PDF, screenshots, protected tables or private catalog embedded. Transcription and engineering applicability remain DECLARED_UNVERIFIED.",records},null,2)+"\n");
});
