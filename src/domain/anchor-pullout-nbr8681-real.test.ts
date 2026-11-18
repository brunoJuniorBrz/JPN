import {afterEach,expect,it,vi} from "vitest";
import {m34abProject,reviewM34Fixture} from "./test-support/m34ab-fixtures";
import {guidedPreset} from "./guided-support";
import {adaptMixedProject} from "./mixed-adapter";
import {buildResistanceReport} from "./resistance-report";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import type {SupportInterface} from "./support-interface";
import {applyNbr8681Combinations,nbr8681DeclarationFor} from "./nbr8681-combinations";
import {applyEngineeringCombinations} from "./apply-engineering-combinations";

afterEach(()=>vi.unstubAllEnvs());
const example=(nodeId:string,kind:SupportInterface["kind"],side:"A"|"B",dofs:SupportInterface["dofs"]):SupportInterface=>({
 nodeId,side,kind,dofs,source:"Levantamento técnico e revisão do apoio",
 revision:"Revisão física R1",loadPath:"Vetor de transmissão até a base de apoio",
 restraintBasis:"Vínculo declarado e checado no memorial do projeto",
 reviewStatus:"site-reviewed",
});
/** N4 integration (cross audit of 7db6287): the NBR 8681 declaration that generated the combinations reaches the anchor
 * check through the real report; the same factors entered by hand (no declaration) stay unverified/PENDENTE. */
it("N4: declaração NBR 8681 completa chega classificada ao arrancamento; sem declaração continua PENDENTE",async()=>{
 vi.stubEnv("NODE_ENV","development");
 vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
 vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
 const run=async(withDeclaration:boolean)=>{
   let p=m34abProject();
   p.workspace.guidedSupport={...guidedPreset("mixed"),left:"existing-concrete",right:"new-column"};
   const d=p.workspace.spatialPreparation!;
   const dofs=(nodeId:string)=>d.supports.find(s=>s.nodeId===nodeId)!.dofs.map(x=>x==="fixed"?"fixed":"free") as SupportInterface["dofs"];
   d.supportInterfaces=[example("B0","existing-concrete","A",dofs("B0")),example("A1","new-steel-column","B",dofs("A1"))];
   // The fixture's single case "Q" classified as a steel permanent action (Tabela 1): both sets, normal ULS.
   const declaration={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
     permanentSets:["unfavorable","favorable"],families:["uls-normal"],actions:[{nature:"permanent",caseId:"Q",permanentType:"steel-and-equipment"}]};
   const generated=applyNbr8681Combinations(p,declaration);
   p=withDeclaration?generated.project:applyEngineeringCombinations(p,generated.generated.engineeringCombinations);
   expect(!!p.workspace.spatialPreparation!.nbr8681Declaration).toBe(withDeclaration);
   reviewM34Fixture(p);
   const prepared=await adaptMixedProject(p);
   const result=await runLocalMixed(JSON.stringify(prepared.request));
   if(result.status!=="completed"||result.result.schema_version!=="jpn.mixed3d-result/1")throw new Error("Python misto não executou.");
   return (await buildResistanceReport(p,prepared,result.result)).anchorPullout;
 };
 const classified=await run(true);
 expect(classified.permanentClassificationVerified).toBe(true);
 expect(classified.favorablePermanentSet).toBe("present");expect(classified.unfavorablePermanentSet).toBe("present");
 expect(classified.permanentFactorMismatches).toEqual([]);
 expect(classified.supports[0].issues.join()).not.toMatch(/ANCHOR_PERMANENT_CLASSIFICATION_UNVERIFIED/);
 const bare=await run(false);
 expect(bare.permanentClassificationVerified).toBe(false);expect(bare.favorablePermanentSet).toBe("unverified");
 expect(bare.supports[0].issues.join()).toMatch(/ANCHOR_PERMANENT_CLASSIFICATION_UNVERIFIED/);
 expect(bare.studioStatus.B0).toBe("pending");
 expect(classified.computedStructuralApproval).toBe(false);expect(classified.fabricationRelease).toBe(false);expect(classified.releaseGate).toBe("NOT_READY_BLOCKED");
},60000);

it("N4: declaração guardada que não reproduz a tabela atual (editada à mão) não é usada",()=>{
 const p=m34abProject();
 const declaration={schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
   permanentSets:["unfavorable","favorable"],families:["uls-normal"],actions:[{nature:"permanent",caseId:"Q",permanentType:"steel-and-equipment"}]};
 const sp=applyNbr8681Combinations(p,declaration).project.workspace.spatialPreparation!;
 expect(nbr8681DeclarationFor(sp)).not.toBeNull();
 const edited=structuredClone(sp);edited.engineeringCombinations!.combinations[0].terms[0].gamma=1.35;
 expect(nbr8681DeclarationFor(edited)).toBeNull();
 expect(nbr8681DeclarationFor({...sp,nbr8681Declaration:{...declaration,actions:[{nature:"permanent",caseId:"Q"}]}})).toBeNull();
});
