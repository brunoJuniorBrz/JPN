import {describe,expect,it} from "vitest";
import {auditSecondOrderReadiness} from "./second-order-readiness";

const basis=()=>({
  schema_version:"jpn.mixed3d/1" as const,
  theory:"linear-elastic-frame-axial" as const,
  project:{id:"M43-P1",revision:"REV-1"},
  nodes:[
    {id:"BASE",x_m:0,y_m:0,z_m:0},
    {id:"TOP",x_m:0,y_m:0,z_m:4},
  ],
  members:[{id:"COLUMN",kind:"frame" as const}],
  combinations:[{id:"ULS-WIND"},{id:"SLS-WIND"}],
});
const solved=()=>({
  schema_version:"jpn.mixed3d-result/1" as const,
  project:{id:"M43-P1",revision:"REV-1"},
  combinations:Object.fromEntries(["ULS-WIND","SLS-WIND"].map(id=>[id,{
    nodes:{BASE:{translation_m:[0,0,0] as [number,number,number]},
      TOP:{translation_m:[0.01,0,-0.0001] as [number,number,number]}},
    equilibrium:{relative_residual:1e-12},
  }])),
});
describe("M43-P1: second-order readiness, not an unsafe approximate stability approval",()=>{
  it("reports per-case 3D displacement observations but rejects a second-order PASS",()=>{
    const audit=auditSecondOrderReadiness(basis(),solved());
    expect(audit.topology).toBe("frame-only");
    expect(audit.frameMemberCount).toBe(1);
    expect(audit.combinations).toHaveLength(2);
    expect(audit.combinations[0].governingNodeId).toBe("TOP");
    expect(audit.combinations[0].maximumTranslationToSpanRatio)
      .toBeCloseTo(Math.hypot(0.01,-0.0001)/4,12);
    expect(audit.combinations[0].linearEquilibriumResidual).toBe(1e-12);
    expect(audit.secondOrderAudit).toBeUndefined();
    expect(audit.pDeltaExecuted).toBe(false);
    expect(audit.bucklingModesCalculated).toBe(false);
    expect(audit.normativeStabilityVerified).toBe(false);
    expect(audit.fabricationRelease).toBe(false);
    expect(audit.releaseGate).toBe("NOT_READY_BLOCKED");
  });
  it("flags Spring3D axial geometric-stiffness gap in genuinely mixed topology",()=>{
    const project=basis();
    const mixed={...project,members:[
      ...project.members,{id:"BRACE",kind:"axial" as const},
    ]};
    const result=auditSecondOrderReadiness(mixed,solved());
    expect(result.topology).toBe("mixed-frame-axial");
    expect(result.axialMemberCount).toBe(1);
    expect(result.blockers.some(x=>x.includes("M43_AXIAL_SPRING_KG_UNSUPPORTED"))).toBe(true);
  });
  it("does not quietly approve an entirely axial structure as a frame",()=>{
    const q={...basis(),members:[{id:"TIE",kind:"axial" as const}]};
    const audit=auditSecondOrderReadiness(q,solved());
    expect(audit.topology).toBe("axial-only");
    expect(audit.pDeltaExecuted).toBe(false);
    expect(audit.blockers.some(x=>x.includes("SPRING_KG_UNSUPPORTED"))).toBe(true);
  });
  it("does not accept reused result after project revision or contract version changes",()=>{
    const p=basis(),res=solved();
    p.project.revision="REV-2";
    expect(()=>auditSecondOrderReadiness(p,res)).toThrow("M43_STALE_ANALYSIS");
    p.project.revision="REV-1";
    const changed={...res,schema_version:"jpn.mixed3d-result/2" as const};
    expect(()=>auditSecondOrderReadiness(p,changed)).toThrow("M43_STALE_ANALYSIS");
  });
  it("refuses partial case results, missing nodes and failed linear equilibrium",()=>{
    const p=basis(),r=solved();
    delete r.combinations["ULS-WIND"];
    expect(()=>auditSecondOrderReadiness(p,r)).toThrow("M43_CASE_MISMATCH");
    const r2=solved();
    delete r2.combinations["ULS-WIND"].nodes.BASE;
    expect(()=>auditSecondOrderReadiness(p,r2)).toThrow("M43_NODE_MISMATCH");
    const r3=solved();
    r3.combinations["ULS-WIND"].equilibrium.relative_residual=0.1;
    expect(()=>auditSecondOrderReadiness(p,r3)).toThrow("M43_LINEAR_EQUILIBRIUM_INVALID");
  });
  it("refuses nonfinite displacement but never treats small displacements as stability proof",()=>{
    const r=solved();r.combinations["ULS-WIND"].nodes.TOP.translation_m[0]=Infinity;
    expect(()=>auditSecondOrderReadiness(basis(),r)).toThrow("M43_NONFINITE_TRANSLATION");
    const q=solved();q.combinations["ULS-WIND"].nodes.TOP.translation_m=[0,0,0];
    const audit=auditSecondOrderReadiness(basis(),q);
    expect(audit.combinations[0].maximumNodalTranslationM).toBe(0);
    expect(audit.normativeStabilityVerified).toBe(false);
  });
});
