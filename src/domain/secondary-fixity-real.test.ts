import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {adaptMixedProject} from "./mixed-adapter";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {m49GarageProject} from "./test-support/m49-garage-project";
import {secondaryFixityShed,type ShedOptions} from "./test-support/secondary-fixity-project";
import {assessSecondaryFixity,presumedSecondaryFixity,secondaryFixityCounterfactual,type CounterfactualOutcome} from "./secondary-fixity";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {SolverFailure} from "@/infrastructure/analysis/runner";

beforeAll(()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");});
afterAll(()=>vi.unstubAllEnvs());

/** Real capped Python 3.12 / PyNite 3.2.1 worker, unchanged gates and tolerances. */
async function solve(request:unknown){
  try{
    const out=await runLocalMixed(JSON.stringify(request));
    if(out.status!=="completed")throw Error("Expected a completed analysis");
    return {outcome:{completed:true} as CounterfactualOutcome,result:out.result};
  }catch(e){
    if(!(e instanceof SolverFailure))throw e;
    return {outcome:{completed:false,refusalCode:e.code} as CounterfactualOutcome,result:null};
  }
}
async function audit(options:ShedOptions){
  const project=secondaryFixityShed(options),prepared=await adaptMixedProject(project);
  const declared=await solve(prepared.request),counter=secondaryFixityCounterfactual(project,prepared);
  const counterfactual=counter.request?await solve(counter.request):null;
  return {prepared,declared,counter,counterfactual,verdict:assessSecondaryFixity(counter,counterfactual?.outcome??null)};
}

it("UNSTABLE: accepted model whose only longitudinal stability is group-inherited purlin fixity is blocked",async()=>{
  const a=await audit({purlinGroup:"rigid"});
  // The declared model is a valid FE solution in perfect equilibrium...
  expect(a.declared.outcome.completed).toBe(true);
  const combo=a.declared.result!.combinations.C,purlin=combo.members.P1;
  expect(combo.equilibrium.relative_residual).toBeLessThan(1e-8);
  if(purlin.kind!=="frame")throw Error("P1 must be a frame");
  // ...in which each purlin end carries the whole storey moment: 1 kN x 4 m / 2 ends.
  expect(Math.max(...[4,5,10,11].map(i=>Math.abs(purlin.end_actions_local[i])))).toBeCloseTo(2000,0);
  expect(a.counter.presumedEnds.map(e=>[e.pieceId,e.end,e.nodeId])).toEqual([["P1","start","T1"],["P1","end","T3"],["P2","start","T2"],["P2","end","T4"]]);
  // Only the presumed bending continuity changed; nothing was added.
  const before=a.prepared.request,after=a.counter.request!;
  expect({...after,members:[]}).toEqual({...before,members:[]});
  for(const [i,m] of after.members.entries()){
    const original=before.members[i];
    if(m.kind!=="frame"||original.kind!=="frame"||!["P1","P2"].includes(m.id)){expect(m).toEqual(original);continue;}
    expect(m.release_start).toEqual([false,false,false,false,true,true]);expect(m.release_end).toEqual([false,false,false,false,true,true]);
    expect({...m,release_start:0,release_end:0}).toEqual({...original,release_start:0,release_end:0});
  }
  expect(a.counterfactual!.outcome).toEqual({completed:false,refusalCode:"UNSTABLE"});
  expect(a.verdict).toMatchObject({status:"blocked",blockingCode:"STABILITY_DEPENDS_ON_SECONDARY_FIXITY",pieces:["P1","P2"],
    computedStructuralApproval:false,fabricationRelease:false,releaseGate:"NOT_READY_BLOCKED"});
},60000);

it("STABLE: the same shed with declared axial bracing does not depend on purlin fixity",async()=>{
  const a=await audit({purlinGroup:"rigid",braced:true});
  expect(a.declared.outcome.completed).toBe(true);expect(a.counter.presumedEnds).toHaveLength(4);
  expect(a.counterfactual!.outcome).toEqual({completed:true});
  const combo=a.counterfactual!.result!.combinations.C,x1=combo.members.X1,x2=combo.members.X2;
  expect(combo.equilibrium.relative_residual).toBeLessThan(1e-8);
  // Statics of the released model: each diagonal carries 1 kN horizontally, N = 1 kN x sqrt(41)/5.
  if(x1.kind!=="axial"||x2.kind!=="axial")throw Error("Braces must be axial");
  for(const brace of [x1,x2])expect(Math.abs(brace.axial_n)).toBeCloseTo(1000*Math.sqrt(41)/5,3);
  const p1=combo.members.P1;if(p1.kind!=="frame")throw Error("P1 must be a frame");
  for(const i of [4,5,10,11])expect(Math.abs(p1.end_actions_local[i])).toBeLessThan(1e-6);
  expect(a.verdict).toMatchObject({status:"independent-of-presumed-fixity",blockingCode:null,releaseGate:"NOT_READY_BLOCKED"});
},60000);

it("PRESERVED: a moment connection declared piece by piece is neither released nor blocked",async()=>{
  const a=await audit({purlinGroup:"bending-pinned",explicitRigidPurlins:true});
  expect(a.declared.outcome.completed).toBe(true);
  expect(a.counter.presumedEnds).toEqual([]);expect(a.counter.request).toBeNull();expect(a.counterfactual).toBeNull();
  expect(a.verdict).toMatchObject({status:"no-presumed-fixity",blockingCode:null});
},60000);

it("the solver itself still refuses the unbraced shed when purlins are declared as real bending hinges",async()=>{
  const project=secondaryFixityShed({purlinGroup:"bending-pinned"}),prepared=await adaptMixedProject(project);
  expect(presumedSecondaryFixity(project,prepared)).toEqual([]);
  expect((await solve(prepared.request)).outcome).toEqual({completed:false,refusalCode:"UNSTABLE"});
},60000);

it("M49 garage: explicit hinges mean nothing is presumed, and a pending audit can never be read as approval",async()=>{
  const project=m49GarageProject(),prepared=await adaptLoadedMixedProject(project);
  const counter=secondaryFixityCounterfactual(project,prepared);
  expect(counter.presumedEnds).toEqual([]);expect(assessSecondaryFixity(counter,null).status).toBe("no-presumed-fixity");
  const shed=secondaryFixityShed({purlinGroup:"rigid"}),pending=secondaryFixityCounterfactual(shed,await adaptMixedProject(shed));
  expect(()=>assessSecondaryFixity(pending,null)).toThrow(/SECONDARY_FIXITY_AUDIT_PENDING/);
  expect(assessSecondaryFixity(pending,{completed:false,refusalCode:"MODEL_LIMIT"}).blockingCode).toBe("STIFFNESS_DEPENDS_ON_SECONDARY_FIXITY");
  expect(assessSecondaryFixity(pending,{completed:false,refusalCode:"TIMEOUT"}).blockingCode).toBe("SECONDARY_FIXITY_AUDIT_INCONCLUSIVE");
},60000);
