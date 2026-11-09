import {afterEach,expect,it,vi} from "vitest";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {guidedPreset} from "./guided-support";
import {adaptMixedProject} from "./mixed-adapter";
import {buildResistanceReport} from "./resistance-report";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import type {SupportInterface} from "./support-interface";

afterEach(()=>vi.unstubAllEnvs());
const example=(nodeId:string,kind:SupportInterface["kind"],side:"A"|"B",dofs:SupportInterface["dofs"]):SupportInterface=>({
 nodeId,side,kind,dofs,source:"Levantamento técnico e revisão do apoio",
 revision:"Revisão física R1",loadPath:"Vetor de transmissão até a base de apoio",
 restraintBasis:"Vínculo declarado e checado no memorial do projeto",
 reviewStatus:"site-reviewed",
});
it("executa a obra com concreto existente e pilar novo: interface -> PyNite real -> reações -> relatório bloqueado",async()=>{
 vi.stubEnv("NODE_ENV","development");
 vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
 vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
 const p=m34abProject();
 p.workspace.guidedSupport={...guidedPreset("mixed"),left:"existing-concrete",right:"new-column"};
 const d=p.workspace.spatialPreparation!;
 const dofs=(nodeId:string)=>d.supports.find(s=>s.nodeId===nodeId)!.dofs.map(x=>x==="fixed"?"fixed":"free") as SupportInterface["dofs"];
 d.supportInterfaces=[
   example("B0","existing-concrete","A",dofs("B0")),
   example("A1","new-steel-column","B",dofs("A1")),
 ];
 reviewM34Fixture(p);
 const prepared=await adaptMixedProject(p);
 expect(prepared.request.supports).toEqual(d.supports.filter(s=>s.dofs.some(x=>x==="fixed"))
   .map(s=>({node:s.nodeId,restrained:s.dofs.map(x=>x==="fixed")})));
 const result=await runLocalMixed(JSON.stringify(prepared.request));
 if(result.status!=="completed"||result.result.schema_version!=="jpn.mixed3d-result/1")
   throw new Error("Python misto não executou modelo com apoios rastreáveis.");
 const report=await buildResistanceReport(p,prepared,result.result);
 expect(report.supportAudits).toHaveLength(2*Object.keys(result.result.combinations).length);
 for(const record of report.supportAudits){
   const reaction=result.result.combinations[record.combinationId].nodes[record.nodeId].reaction_force_n;
   expect(record.checks[0].demandKn).toBeCloseTo(Math.max(0,reaction[2])/1000,9);
   expect(record.checks[1].demandKn).toBeCloseTo(Math.max(0,-reaction[2])/1000,9);
   expect(record.checks[2].demandKn).toBeCloseTo(Math.hypot(reaction[0],reaction[1])/1000,9);
   expect(record.status).toBe("capacity-pending");
   expect(record.normativeApproval).toBe(false);
 }
 expect(report.releaseGate.status).toBe("NOT_READY_BLOCKED");
 expect(report.releaseGate.fabricationRelease).toBe(false);
 d.supportInterfaces![0].dofs[0]="free";
 await expect(adaptMixedProject(p)).rejects.toThrow(/SUPPORT_INTERFACE_STALE/);
},30000);
