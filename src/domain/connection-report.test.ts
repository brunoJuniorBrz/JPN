import { beforeAll,afterAll,expect,it,vi } from "vitest";
import { windReferenceProject } from "./examples/wind-project";
import { loadedMixedReferenceProject } from "./examples/loaded-mixed-project";
import { generateStructure } from "./calculations/structure";
import { buildResistanceReport,assertResistanceReportCurrent } from "./resistance-report";
import { buildPreproductionDossier } from "./calculations/preproduction";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { buildConnectionReport,assertConnectionReportCurrent } from "./connection-report";
import { verifyJointActionTrace } from "./member-end-actions";
import { connectionsSchema } from "./connections";
import { saveConnectionDeclaration,physicalConnectionNodes,stabilityFailureExplanation } from "./connection-declaration";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { anyMixedResultSchema } from "./structural-loading";
import { projectSchema,emptySnapshot } from "./models";
import { parseBackup,serializeBackup } from "@/infrastructure/persistence/local";

let project:ReturnType<typeof windReferenceProject>,prepared:Awaited<ReturnType<typeof adaptLoadedMixedProject>>,result:ReturnType<typeof anyMixedResultSchema.parse>,trace:unknown,report:Awaited<ReturnType<typeof buildConnectionReport>>;
beforeAll(async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  project=windReferenceProject();prepared=await adaptLoadedMixedProject(project);const output=await runLocalMixed(JSON.stringify(prepared.request),"connections");
  if(output.status!=="completed"||!output.joint_actions)throw Error("Expected real protected joint trace");result=output.result;trace=output.joint_actions;report=await buildConnectionReport(project,prepared,result,trace);
},25000);
afterAll(()=>vi.unstubAllEnvs());
function declaration(){
  const n=physicalConnectionNodes(project).find(n=>n.pieceIds.length>=3)!;
  return {id:"J-1",nodeId:n.nodeId,typology:"truss-joint" as const,participants:n.pieceIds.map(pieceId=>({pieceId,behavior:"as-modeled" as const})),transferHypothesis:"Synthetic explicit transfer hypothesis, not a construction approval",offsetGlobalM:[0,0,0],stiffness:null,components:[],source:"Independent synthetic test",revision:"1",responsible:"Synthetic reviewer"};
}

it("JPN → PyNite real → Rᵀ → todas as juntas, combinações e reações globais",()=>{
  expect(report.physicalNodes).toHaveLength(132);expect(new Set(report.physicalNodes.flatMap(n=>n.participants.map(p=>p.pieceId))).size).toBe(207);
  expect(report.combinations).toHaveLength(4);expect(report.binding.inputSha256).toBe(prepared.input_sha256);
  for(const c of report.combinations){expect(c.joints).toHaveLength(132);expect(c.joints.reduce((s,j)=>s+j.ends.length,0)).toBe(486);expect(c.globalBalance.withinTolerance).toBe(true);for(const j of c.joints)expect(j.balance.withinTolerance).toBe(true);}
  const sum=(combo:string)=>report.combinations.find(c=>c.combinationId===combo)!.joints.reduce((s,j)=>s+j.reaction.forceN[2],0);
  expect(sum("WP")).toBeCloseTo(50000,5);expect(sum("WS")).toBeCloseTo(-50000,5);expect(sum("DOUBLE")).toBeCloseTo(100000,5);expect(sum("SUM")).toBeCloseTo(70000,5);
  expect(report.diagnostics.normativeStabilityVerified).toBe(false);expect(report.diagnostics.secondOrderVerified).toBe(false);expect(report.approvedForFabrication).toBe(false);
});
it("ações de junta têm sinal oposto ao nativo e cortes contínuos não ganham rótulas/emendas",()=>{
  const c=report.combinations[0];let internalCount=0;
  for(const j of c.joints)for(const end of j.ends){
    if(end.kind==="frame"){
      if(!end.originalPieceEnd){internalCount++;expect(end.releases).toEqual([false,false,false,false,false,false]);}
      const local=result.combinations[c.combinationId].members[end.segmentId];if(local.kind!=="frame")throw Error("Expected frame");
      const offset=end.end==="start"?0:6;
      expect(end.nodeOnMemberLocal).toEqual({forceN:local.end_actions_local.slice(offset,offset+3),momentNm:local.end_actions_local.slice(offset+3,offset+6)});
    }else{expect(end.memberOnNodeGlobal.momentNm).toBeNull();expect(end.releases).toBeNull();expect(Object.keys(end.nodeOnMemberLocal)).toEqual(["axialN"]);}
  }
  expect(internalCount).toBeGreaterThan(0);
});
it("recusa bases presumidas, ações alteradas e dupla contagem de UDL como carga nodal",async()=>{
  const t=structuredClone(trace) as ReturnType<typeof verifyJointActionTrace>,id=prepared.request.members.find(m=>m.kind==="frame")!.id;
  t.members[id].global_to_local[0][0]+=.1;expect(()=>verifyJointActionTrace(prepared.request,result,t)).toThrow(/JOINT_TRACE_INVALID/);
  const force=structuredClone(result),native=force.combinations.WP.members[id];if(native.kind!=="frame")throw Error("Expected frame");native.end_actions_local[0]+=10;
  await expect(buildConnectionReport(project,prepared,force,trace)).rejects.toThrow(/JOINT_EQUILIBRIUM_FAILURE/);
  const loads=structuredClone(trace) as typeof t;loads.combinations.WP.nodal_loads[prepared.request.nodes[0].id][2]+=100;
  expect(()=>verifyJointActionTrace(prepared.request,result,loads)).toThrow(/nodais compiladas/);
});
it("declarações físicas são manuais, únicas, persistidas e não alteram apoios/liberações",()=>{
  const d=declaration(),p=saveConnectionDeclaration(project,d),before=project.workspace.spatialPreparation!,next=p.workspace.spatialPreparation!;
  expect(next.supports).toEqual(before.supports);expect(next.memberConnections).toEqual(before.memberConnections);expect(next.groups).toEqual(before.groups);
  expect(next.connections!.connections[0].participants.map(p=>p.pieceId)).toEqual(d.participants.map(p=>p.pieceId));
  const parsed=projectSchema.parse(p),restored=parseBackup(serializeBackup({...emptySnapshot(),projects:[parsed]})).data.projects[0];expect(restored.workspace.spatialPreparation!.connections).toEqual(next.connections);
  expect(()=>saveConnectionDeclaration(project,{...d,participants:d.participants.slice(1)})).toThrow(/CONNECTION_PARTICIPANTS/);
  const base=next.connections!,duplicate={...base,connections:[base.connections[0],{...base.connections[0],id:"J-2"}]};expect(()=>connectionsSchema.parse(duplicate)).toThrow(/CONNECTION_DUPLICATE/);
  const bolt={id:"BOLT-1",kind:"bolts",quantity:null,diameterMm:null,grade:null,arrangement:null,holesAndDistances:null,source:"Declared pending hardware",revision:"1"};
  expect(()=>connectionsSchema.parse({...base,connections:[{...base.connections[0],components:[bolt,bolt]}]})).toThrow(/COMPONENT_DUPLICATE/);
});
it("declaração e mudanças físicas tornam a análise/relatório anterior obsoletos",async()=>{
  await assertConnectionReportCurrent(report,project,prepared,result,trace);
  const p=saveConnectionDeclaration(project,declaration());await expect(assertConnectionReportCurrent(report,p,prepared,result,trace)).rejects.toThrow(/STALE_CONNECTION_ANALYSIS/);
  for(const change of [
    (p:typeof project)=>{p.workspace.spatialPreparation!.supports[0].dofs[0]="free";},
    (p:typeof project)=>{p.workspace.spatialPreparation!.groups.purlin.rotationDeg=10;},
    (p:typeof project)=>{p.workspace.spatialPreparation!.groups.purlin.areaCm2=20;},
    (p:typeof project)=>{p.workspace.spatialPreparation!.loading!.wind!.cases[0].dynamicPressurePa=1000;},
    (p:typeof project)=>{p.workspace.spatialPreparation!.combinations[0].factors.WP=2;},
    (p:typeof project)=>{p.roof.widthM=12;},
  ]){const p=structuredClone(project);change(p);await expect(assertConnectionReportCurrent(report,p,prepared,result,trace)).rejects.toThrow();}
  const altered=structuredClone(report);altered.physicalNodes[0].state.fabricationApproved=true as false;await expect(assertConnectionReportCurrent(altered,project,prepared,result,trace)).rejects.toThrow(/conteúdo/);
},15000);
it("peso próprio axial entra como carga nodal; pórtico permanece distribuído",async()=>{
  const p=loadedMixedReferenceProject(),a=await adaptLoadedMixedProject(p),o=await runLocalMixed(JSON.stringify(a.request),"connections");if(o.status!=="completed"||!o.joint_actions)throw Error("Expected real weight trace");
  const r=await buildConnectionReport(p,a,o.result,o.joint_actions);expect(r.combinations.every(c=>c.globalBalance.withinTolerance)).toBe(true);
  expect(o.result.schema_version).toBe("jpn.mixed3d-result/2");if(o.result.schema_version!=="jpn.mixed3d-result/2")throw Error("Expected weight");
  const sw=o.result.loading.self_weight!;expect(sw.members.some(m=>m.representation==="half-to-end-nodes")).toBe(true);expect(sw.members.some(m=>m.representation==="consistent-frame-udl")).toBe(true);
  const continuous=(await buildResistanceReport(p,a,o.result,o.joint_actions)).continuousDemands!;expect(continuous.pieces.some(p=>p.fields.some(f=>f.loadLocalNM.some(x=>x!==0)))).toBe(true);
},20000);
it("nó exclusivamente axial não recebe resíduos rotacionais ou vínculos artificiais",async()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!,column=generateStructure(p).model!.pieces.find(m=>m.role==="column")!;
  d.memberKinds=[...(d.memberKinds??[]).filter(m=>m.pieceId!==column.id),{pieceId:column.id,kind:"axial"}];
  d.memberConnections=[...d.memberConnections.filter(m=>m.pieceId!==column.id),{pieceId:column.id,start:"axial",end:"axial"}];
  const support=d.supports.find(s=>s.nodeId===column.start)!;
  support.dofs=["fixed","fixed","fixed","free","free","free"];
  const a=await adaptLoadedMixedProject(p),o=await runLocalMixed(JSON.stringify(a.request),"connections");
  if(o.status!=="completed"||!o.joint_actions)throw Error("Expected stable mixed model with explicit axial base");
  const r=await buildConnectionReport(p,a,o.result,o.joint_actions),base=r.combinations[0].joints.find(j=>j.nodeId===column.start)!;
  expect(base.ends).toHaveLength(1);expect(base.ends[0].kind).toBe("axial");expect(base.dofs.rotation).toBeNull();
  expect(base.solverResidualInFreeDofs.slice(3)).toEqual([null,null,null]);expect(base.reaction.momentNm).toBeNull();
  expect(base.support!.restrained.slice(3)).toEqual([false,false,false]);expect(base.balance.withinTolerance).toBe(true);
},20000);
it("erros físicos e numéricos produzem diagnósticos explícitos, sem aprovação de estabilidade",()=>{
  for(const code of ["UNSTABLE","ILL_CONDITIONED","DISCONNECTED_MODEL","UNSUPPORTED_RELEASE","EQUILIBRIUM_FAILURE","UNRESOLVED_CONTACT"])expect(stabilityFailureExplanation(code)).toBeTruthy();
  expect(stabilityFailureExplanation("UNRECOGNIZED")).toBeNull();
});
it("M26 integra cobertura, solicitações contínuas, ações de juntas e M25 sem promover aprovação",async()=>{
  const before=buildPreproductionDossier(project),r=await buildResistanceReport(project,prepared,result,trace);
  expect(r.continuousDemands!.pieces).toHaveLength(207);expect(r.continuousDemands!.pieces.flatMap(p=>p.fields)).toHaveLength(243*4);
  expect(r.continuousDemands!.pieces.every(p=>p.fields.every(f=>f.displacementStatus===(p.kind==="frame"?"continuous-verified":"unsupported")))).toBe(true);
  expect(buildPreproductionDossier(project)).toEqual(before);expect(r.pieces.every(p=>!p.approved&&p.normativeReadiness.utilization===null)).toBe(true);
  await assertResistanceReportCurrent(r,project,prepared,result,trace);await expect(assertResistanceReportCurrent(r,project,prepared,result)).rejects.toThrow(/STALE_RESISTANCE_REPORT/);
},20000);
