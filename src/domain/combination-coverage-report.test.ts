import {afterEach,expect,it,vi} from "vitest";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {applyEngineeringCombinations} from "./apply-engineering-combinations";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {adaptMixedProject} from "./mixed-adapter";
import {assertResistanceReportCurrent,buildResistanceReport} from "./resistance-report";
import {emptyLoading} from "./structural-loading";
import {m34abProject} from "./test-support/m34ab-fixtures";

afterEach(()=>vi.unstubAllEnvs());

it.each([false,true])("exporta cobertura ELU/ELS da análise mista (carregada: %s)",async(loaded)=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");

  const fixture=m34abProject();
  const draft=fixture.workspace.spatialPreparation!;
  const verticalKn={G:-0.2,W1:-0.3,W2:0.4};
  const source="Ensaio analítico de superposição elástica";
  const reference={standard:source,edition:"Referência sintética",clause:"Equilíbrio estático",
    source,revision:"REV-1",responsible:"Ensaio automatizado"};
  draft.cases=Object.keys(verticalKn).map(id=>({id,source}));
  draft.loads=Object.entries(verticalKn).map(([caseId,fzKn])=>({
    id:crypto.randomUUID(),caseId,nodeId:"B2",fxKn:0,fyKn:0,fzKn,mxKnm:0,myKnm:0,mzKnm:0,
  }));
  if(loaded)draft.loading=emptyLoading();
  const project=applyEngineeringCombinations(fixture,{
    schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:[
      {caseId:"G",category:"permanent",exclusiveGroup:null,reference},
      {caseId:"W1",category:"wind",exclusiveGroup:"ALTERNATIVAS",reference},
      {caseId:"W2",category:"wind",exclusiveGroup:"ALTERNATIVAS",reference},
    ],
    combinations:[
      {id:"U1",purpose:"ULS",hypothesis:source,reference,terms:[
        {caseId:"G",gamma:2,psi:1,reference},
        {caseId:"W1",gamma:3,psi:0.5,reference},
        {caseId:"W2",gamma:0,psi:1,reference},
      ]},
      {id:"S2",purpose:"SLS-characteristic",hypothesis:source,reference,terms:[
        {caseId:"G",gamma:1,psi:1,reference},
        {caseId:"W1",gamma:0,psi:1,reference},
        {caseId:"W2",gamma:1,psi:0.25,reference},
      ]},
    ],
  });
  const prepared=await (loaded?adaptLoadedMixedProject(project):adaptMixedProject(project));
  const output=await runLocalMixed(JSON.stringify(prepared.request));
  if(output.status!=="completed")throw Error("O PyNite não retornou a análise.");
  const report=await buildResistanceReport(project,prepared,output.result);
  const coverage=report.engineeringCombinationCoverage;
  expect(coverage).toMatchObject({
    coverageStatus:"review-required",missingULS:["W2"],missingSLS:["W1"],
    normativeFactorsVerified:false,normativeCompliance:false,
    computedStructuralApproval:false,fabricationRelease:false,releaseGate:"NOT_READY_BLOCKED",
    matrix:[
      {combinationId:"U1",factors:{G:2,W1:1.5,W2:0},explicitZeroCases:["W2"],
        activeExclusiveGroups:[{group:"ALTERNATIVAS",activeCase:"W1"}]},
      {combinationId:"S2",factors:{G:1,W1:0,W2:0.25},explicitZeroCases:["W1"],
        activeExclusiveGroups:[{group:"ALTERNATIVAS",activeCase:"W2"}]},
    ],
  });
  // 2(-0.2) + 1.5(-0.3) = -0.85 kN and -0.2 + 0.25(0.4) = -0.1 kN at x = 2 m.
  for(const [combination,forceN] of [["U1",850],["S2",100]] as const){
    const root=output.result.combinations[combination].nodes.B0;
    expect(root.reaction_force_n[2]).toBeCloseTo(forceN,6);
    expect(root.reaction_moment_nm[1]).toBeCloseTo(-2*forceN,6);
  }
  expect(report.releaseGate).toMatchObject({
    status:"NOT_READY_BLOCKED",computedStructuralApproval:false,fabricationRelease:false,
  });
  await assertResistanceReportCurrent(report,project,prepared,output.result);
  const altered=structuredClone(report);
  altered.engineeringCombinationCoverage?.missingULS.pop();
  await expect(assertResistanceReportCurrent(altered,project,prepared,output.result))
    .rejects.toThrow("STALE_RESISTANCE_REPORT");
},30000);
