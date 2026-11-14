import {afterEach,expect,it,vi} from "vitest";
import {roofProject} from "./test-support/m42-roof-fixture";
import {applyNbr6120Actions} from "./nbr6120-actions";
import {applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProjectV3} from "./loaded-mixed-adapter";
import {declareLocalAxes} from "./local-axes-review";
import {projectFrameAxes} from "./current-mixed-adapter";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {buildResistanceReport} from "./resistance-report";
import {buildSteelIRequests,standardOf} from "./steel-i-member-requests";
import {buildMemberCombinationMatrix} from "./member-combination-matrix";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {runLocalSection} from "@/infrastructure/analysis/local-section-runner";
import type {Project} from "./models";
afterEach(()=>vi.unstubAllEnvs());
const enable=()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");};

function chain(withGeometry:boolean):Project{
  const r6=applyNbr6120Actions(roofProject(),{schema_version:"jpn.nbr6120-roof-actions/1",permanent:[{kind:"roof-cladding",caseId:"TELHA",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"}],roofLiveLoad:{caseId:"SC"}});
  const {project}=applyNbr8681Combinations(r6.project,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable"],families:["uls-normal"],
    actions:[{nature:"permanent",caseId:"ZERO",permanentType:"steel-and-equipment"},...r6.nbr8681Actions]});
  const sp=project.workspace.spatialPreparation!;
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio INT-1d: ações independentes",revision:"INT-1d v1",basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  sp.resistanceStandards=["P1","P2","P3"].map(pieceId=>({pieceId,standard:"NBR8800" as const}));
  sp.resistance=["P1","P2","P3"].map(pieceId=>({pieceId,family:"welded" as const,fyMpa:345,fuMpa:450,bucklingYM:5,bucklingZM:5,lateralRestraintM:5,source:"Cadastro sintético do ensaio INT-1d",revision:"1",
    sectionProperties:{},restraintDescription:"Contenção lateral nos apoios (ensaio)",normativeReference:"NBR 8800:2024 (ensaio)",profileDesignation:"I soldado sintético",
    ...(withGeometry?{geometry:{version:1 as const,basis:"physical-engineer-declaration" as const,shape:"i" as const,dimensionsMm:{height:400,width:200,webThickness:8,flangeThickness:16},source:"Geometria declarada do ensaio",revision:"1"}}:{})}));
  const a=projectFrameAxes(project);
  return declareLocalAxes(project,a.signature,a.framePieceIds.map(pieceId=>({pieceId,rotationDeg:0,source:"Giro revisado do ensaio INT-1d",revision:"INT-1d v1"})));
}

it("norma por peça: padrão NBR 14762, NBR 8800 persistida; sem geometria I a peça é bloqueada com motivo (nunca padrão)",async()=>{
  enable();
  const bare=chain(false);
  expect(standardOf(bare,"P1")).toBe("NBR8800");expect(standardOf(bare,"TC1")).toBe("NBR14762");
  const prepared=await adaptLoadedMixedProjectV3(bare),solved=await runLocalMixed(JSON.stringify(prepared.request));
  if(solved.status!=="completed")throw Error("PyNite");
  const demands=(await buildResistanceReport(bare,prepared,solved.result)).demands,uls=bare.workspace.spatialPreparation!.engineeringCombinations!.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id);
  const none=buildSteelIRequests(bare,demands as never,uls);
  expect(none.requests).toHaveLength(0);
  expect(none.blocked.map(b=>b.pieceId)).toEqual(["P1","P2","P3"].slice(0,none.blocked.length));
});
it("NBR 8800 pela rota local steel-design: requisições a partir do cadastro, matriz peça × combinação com demanda, resistência e utilização",async()=>{
  enable();
  const project=chain(true),prepared=await adaptLoadedMixedProjectV3(project),solved=await runLocalMixed(JSON.stringify(prepared.request));
  if(solved.status!=="completed")throw Error("PyNite");
  const demands=(await buildResistanceReport(project,prepared,solved.result)).demands,sp=project.workspace.spatialPreparation!,
    uls=sp.engineeringCombinations!.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id);
  const built=buildSteelIRequests(project,demands as never,uls);
  expect(built.blocked).toEqual([]);
  expect(built.requests).toHaveLength(3*uls.length);
  const executions=[];
  for(const r of built.requests){
    const out=await runLocalSection(JSON.stringify(r.request),undefined,"steel-design");
    expect(out.result.computed_structural_approval).toBe(false);expect(out.result.approved_for_fabrication).toBe(false);
    expect(out.result.input_sha256).toHaveLength(64);
    executions.push({pieceId:r.pieceId,combinationId:r.combinationId,checks:out.result.checks as never});
  }
  const pieceStandards=Object.fromEntries(demands.pieces.map(p=>[p.pieceId,standardOf(project,p.pieceId)]));
  const matrix=buildMemberCombinationMatrix({engineeringCombinations:sp.engineeringCombinations!,demands:demands as never,executions,pieceStandards});
  const purlin=matrix.rows.filter(r=>["P1","P2","P3"].includes(r.pieceId));
  expect(purlin.every(r=>r.status==="CONDITIONAL"&&r.resistanceStandard==="NBR8800")).toBe(true);
  const vrd=.6*.4*.008*345e6/1.10;
  for(const r of purlin)for(const c of r.executedChecks)if(c.id==="shear_z")expect(c.resistance).toBeCloseTo(vrd,6);
  expect(matrix.rows.filter(r=>r.status==="no-demand").length).toBeGreaterThan(0);          // chords carry no force in this model: not approval
  expect(matrix.computedStructuralApproval).toBe(false);expect(matrix.releaseGate).toBe("NOT_READY_BLOCKED");
},300000);
