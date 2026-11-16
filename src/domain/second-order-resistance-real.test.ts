import {afterAll,expect,it,vi} from "vitest";
import {prepareAnalysis} from "@/components/planning/mixed-analysis-mode";
import {runLocalMixed,runLocalSecondOrder} from "@/infrastructure/analysis/local-mixed-runner";
import {runLocalSection} from "@/infrastructure/analysis/local-section-runner";
import {runLocalStructuralAssessment} from "@/infrastructure/analysis/local-structural-assessment-runner";
import {secondOrderResistanceProject} from "./test-support/second-order-resistance-project";
import {buildResistanceReport} from "./resistance-report";
import {memberDesignBasis,prepareColdformedDesign} from "./coldformed-design";
import {buildSteelIRequests} from "./steel-i-member-requests";
import {buildMemberCombinationMatrix} from "./member-combination-matrix";
import {restoreMixedAnalysis} from "./restore-mixed-analysis";
import {mkdirSync,writeFileSync} from "node:fs";

afterAll(()=>vi.unstubAllEnvs());
for(const steel of [false,true])it(`real same-column linear/second-order station utilization and restore, ${steel?"NBR8800":"NBR14762"}`,async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const comparisons=[];
  for(const order of ["linear","second-order"] as const){
    const project=secondOrderResistanceProject(steel),d=project.workspace.spatialPreparation!;
    let prepared=await prepareAnalysis(project,order);
    if(!steel){
      const modes={global:1e8,local:2e8,distortional:3e8};
      d.memberDesign=[{schema_version:"jpn.member-design-declaration/1",pieceId:"V0",combinationId:"ULS",
        study:{source:"Synthetic independent software test; not verified critical loads",revision:"1",responsible:"Test",basis_sha256:await memberDesignBasis(project,{physicalInput:prepared.request},"V0"),boundary_and_load_pattern:"Compressed cantilever, explicit sampled actions",minimum_search:"reviewed-elastic-mode-minima"},
        critical:{compression:modes,my_positive:modes,my_negative:modes,mz_positive:modes,mz_negative:modes},tension:null,unstiffenedSingleWeb:true}];
      prepared=await prepareAnalysis(project,order);
    }
    const out=order==="linear"?await runLocalMixed(JSON.stringify(prepared.request),"connections"):await runLocalSecondOrder(JSON.stringify(prepared.request));
    if(out.status!=="completed")throw Error("Expected completed real analysis");
    const trace="joint_actions"in out?out.joint_actions:undefined;
    const report=await buildResistanceReport(project,prepared,out.result,trace);
    const request=steel?buildSteelIRequests(project,report.demands,["ULS"]).requests[0]?.request:await prepareColdformedDesign(project,report,d.memberDesign![0]);
    expect(request).toBeDefined();
    const calculated=steel?await runLocalSection(JSON.stringify(request),undefined,"steel-design"):await runLocalSection(JSON.stringify(request),undefined,"design");
    const result=calculated.result;
    const key=steel?"mz":"mz_positive";
    const check=result.checks.find(c=>c.id===key || (!steel&&c.id==="mz_negative"))!;
    if(!("demand"in check)||!("resistance"in check))throw Error("Expected numerical bending utilization");
    expect(check.utilization).toBeGreaterThan(0);
    const samples=report.demands.pieces[0].samples;
    const demand=Math.max(...samples.map(s=>Math.abs(s.forces.mzNm!)));
    expect(check.demand).toBeCloseTo(demand,8);
    expect(check.utilization).toBeCloseTo(demand/(check.resistance as number),12);
    expect(result).toHaveProperty("binding.analysis_input_sha256",prepared.input_sha256);
    const matrix=buildMemberCombinationMatrix({engineeringCombinations:d.engineeringCombinations!,demands:report.demands,
      pieceStandards:{V0:steel?"NBR8800":"NBR14762"},executions:[{pieceId:"V0",combinationId:"ULS",checks:result.checks as never}]});
    expect(matrix.rows[0].demand!.mzNm!.absoluteMax).toBeCloseTo(demand,8);
    expect(matrix.rows[0].executedChecks.find(c=>c.id===check.id)?.utilization).toBe(check.utilization);
    comparisons.push({utilization:check.utilization as number,demand,matrixUtilization:matrix.rows[0].maxUtilization!});
    if(order==="second-order"){
      expect(result.checks.some(c=>c.id==="second-order-station-coverage"&&c.status==="BLOCKED")).toBe(true);
      const packet=JSON.stringify({prepared,result:out.result,execution:out.execution});
      const restored=await restoreMixedAnalysis(project,packet);
      expect(restored.prepared.input_sha256).toBe(prepared.input_sha256);
      expect(restored.result).toEqual(out.result);
      const changed=structuredClone(project);changed.workspace.spatialPreparation!.loads[0].fyKn=.2;
      await expect(restoreMixedAnalysis(changed,packet)).rejects.toThrow();
      const forged=JSON.parse(packet);forged.result.fabricationRelease=true;
      await expect(restoreMixedAnalysis(project,JSON.stringify(forged))).rejects.toThrow();
      if(!steel){
        const assessed=await runLocalStructuralAssessment(JSON.stringify({schema_version:"jpn.structural-assessment/1",project,analysis:{request:prepared.request,result:out.result}}));
        expect(assessed.analysisInputSha256).toBe(prepared.input_sha256);
        const checked=assessed.checks.find(c=>c.failureMode===check.id)!;
        expect(checked.check.utilization).toBe(check.utilization);
        expect(assessed.releaseGate).toBe("NOT_READY_BLOCKED");
        expect("blocked"in assessed&&assessed.blocked.join()).toContain("SECOND_ORDER_RESTRAINT_ACTIONS_REQUIRED");
      }
    }
  }
  expect(comparisons[1].demand).toBeGreaterThan(1.1*comparisons[0].demand);
  expect(comparisons[1].utilization).toBeGreaterThan(1.1*comparisons[0].utilization);
  // 14762's nonuniform-N interaction is blocked in second order, so the maxima
  // of different sets of executed checks cannot be compared as overall safety.
  if(steel)expect(comparisons[1].matrixUtilization).toBeGreaterThan(1.1*comparisons[0].matrixUtilization);
  const k=Math.sqrt(.3)*Math.PI/2;
  expect(Math.abs((comparisons[1].demand/comparisons[0].demand)/(Math.tan(k)/k)-1)).toBeLessThan(.01);
  expect(comparisons[1].utilization/comparisons[0].utilization).toBeCloseTo(comparisons[1].demand/comparisons[0].demand,8);
  console.info(JSON.stringify({standard:steel?"NBR8800":"NBR14762",linear:comparisons[0],secondOrder:comparisons[1]}));
  mkdirSync(".tools/second-order-resistance",{recursive:true});
  writeFileSync(`.tools/second-order-resistance/${steel?"8800":"14762"}.json`,JSON.stringify({standard:steel?"NBR8800":"NBR14762",linear:comparisons[0],secondOrder:comparisons[1]},null,2));
},120000); // Sequential capped mixed/section workers; each retains its existing 20 s guard.
