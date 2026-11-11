import {describe,expect,it} from "vitest";
import {m34abProject} from "./test-support/m34ab-fixtures";
import {guidedPreset} from "./guided-support";
import {resolvePhysicalStructure} from "./physical-structure";
import {reviewSupportInterfaces,assessSupportReactions,supportInterfacesSchema,type SupportInterface} from "./support-interface";
import {projectSchema} from "./models";

function fixture(){
 const p=m34abProject();
 p.workspace.guidedSupport={...guidedPreset("mixed"),left:"existing-masonry",right:"new-column"};
 const draft=p.workspace.spatialPreparation!;
 const restraints=draft.supports;
 const iface=(nodeId:string,side:"A"|"B",kind:SupportInterface["kind"]):SupportInterface=>({
   nodeId,side,kind,dofs:restraints.find(x=>x.nodeId===nodeId)!.dofs.map(x=>x==="fixed"?"fixed":"free") as SupportInterface["dofs"],
   source:"Levantamento físico declarado pelo engenheiro",revision:"Versão técnica R1",
   loadPath:"Fluxo de carga conferido em projeto",restraintBasis:"Modelo de vínculo justificado pelo engenheiro",
   reviewStatus:"site-reviewed",
 });
 return {p,draft,interfaces:[iface("B0","A","existing-masonry"),iface("A1","B","new-steel-column")]};
}
describe("Interfaces físicas de apoio: parede, concreto, pilar e fundação",()=>{
 it("nunca transforma escolha visual de alvenaria em apoio de cálculo",()=>{
  const {p,draft}=fixture();
  expect(draft.supportInterfaces).toBeUndefined();
  const issues=reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model);
  expect(issues.some(x=>x.code==="SUPPORT_INTERFACE_REQUIRED")).toBe(true);
 });
 it("exige nós reais e rastreabilidade, sem inventar reações nem rigidez",()=>{
  const {p,draft,interfaces}=fixture();draft.supportInterfaces=interfaces;
  expect(supportInterfacesSchema.parse(interfaces)).toHaveLength(2);
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)).toEqual([]);
  expect(projectSchema.safeParse(p).success).toBe(true);
  const changed=structuredClone(p);changed.workspace.spatialPreparation!.supports[0].dofs[0]="free";
  expect(reviewSupportInterfaces(changed,changed.workspace.spatialPreparation!,resolvePhysicalStructure(changed).model)
   .some(x=>x.code==="SUPPORT_INTERFACE_STALE")).toBe(true);
 });
 it("rejeita divergência de tipo, nó órfão e alvenaria sem inspeção",()=>{
  const {p,draft,interfaces}=fixture();draft.supportInterfaces=interfaces;
  draft.supportInterfaces[0].kind="existing-concrete";
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)
    .some(x=>x.code==="SUPPORT_INTERFACE_KIND_MISMATCH")).toBe(true);
  draft.supportInterfaces[0].kind="existing-masonry";draft.supportInterfaces[0].reviewStatus="hypothesis";
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)
    .some(x=>x.code==="EXISTING_SUPPORT_PENDING")).toBe(true);
  draft.supportInterfaces[0].nodeId="DOES-NOT-EXIST";
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)
    .some(x=>x.code==="SUPPORT_INTERFACE_ORPHAN")).toBe(true);
 });
 it("área parcial exige contorno real, alvenaria não cria área retangular",()=>{
  const {p,draft,interfaces}=fixture();p.workspace.guidedSupport={...guidedPreset("attached")};
  draft.supportInterfaces=interfaces;
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)
    .some(x=>x.code==="PARTIAL_ROOF_OUTLINE_PENDING")).toBe(true);
 });
 it("audita compressão, arrancamento e cortante de reação por combinação, sem aprovar",()=>{
  const {interfaces}=fixture();interfaces[0].capacity={
   compressionKn:4,upliftKn:3,horizontalShearKn:2,
   source:"Capacidades declaradas, não estimadas",revision:"R1",
  };
  const node=(f:[number,number,number])=>({reaction_force_n:f,reaction_moment_nm:[0,0,0] as [number,number,number]});
  const result={combinations:{GRAV:{nodes:{B0:node([1000,0,5000]),A1:node([0,0,0])}},
    UPLIFT:{nodes:{B0:node([3000,4000,-6000]),A1:node([0,0,0])}}}};
  const checks=assessSupportReactions(interfaces,result);
  expect(checks.find(x=>x.nodeId==="B0"&&x.combinationId==="GRAV")?.status).toBe("exceeds-declared-capacity");
  const uplift=checks.find(x=>x.nodeId==="B0"&&x.combinationId==="UPLIFT")!;
  expect(uplift.checks[1].demandKn).toBe(6);
  expect(uplift.checks[2].demandKn).toBe(5);
  expect(uplift.status).toBe("exceeds-declared-capacity");
  expect(checks.find(x=>x.nodeId==="A1")?.status).toBe("capacity-pending");
  expect(checks.every(x=>x.normativeApproval===false)).toBe(true);
 });
 it("nunca aceita apoio sem interface física nem declara capacidade se momento estiver pendente",()=>{
  const {p,draft,interfaces}=fixture();
  draft.supportInterfaces=interfaces.slice(0,1);
  expect(reviewSupportInterfaces(p,draft,resolvePhysicalStructure(p).model)
    .some(x=>x.code==="SUPPORT_INTERFACE_UNMAPPED_NODE")).toBe(true);
  const face={...interfaces[0],capacity:{compressionKn:10,upliftKn:10,horizontalShearKn:10,
    source:"Memorial estrutural específico",revision:"R2"}};
  const moment={combinations:{LC:{nodes:{B0:{
    reaction_force_n:[0,0,4000] as [number,number,number],
    reaction_moment_nm:[0,1000,0] as [number,number,number]}}}}};
  const response=assessSupportReactions([face],moment)[0];
  expect(response.momentCapacityPending).toBe(true);
  expect(response.rotationalMomentKnM).toBe(1);
  expect(response.status).toBe("capacity-pending");
  expect(response.normativeApproval).toBe(false);
  const none={combinations:{LC:{nodes:{B0:{
    reaction_force_n:[0,0,4000] as [number,number,number],
    reaction_moment_nm:[0,0,0] as [number,number,number]}}}}};
  expect(assessSupportReactions([face],none)[0].status).toBe("within-declared-capacity");
  expect(assessSupportReactions([{...face,reviewStatus:"hypothesis"}],none)[0].status).toBe("capacity-pending");
 });
 it("não aceita capacidade negativa, nós duplicados nem fonte vazia",()=>{
  const {interfaces}=fixture();
  expect(supportInterfacesSchema.safeParse([...interfaces,interfaces[0]]).success).toBe(false);
  expect(supportInterfacesSchema.safeParse([{...interfaces[0],source:"   "}]).success).toBe(false);
  expect(supportInterfacesSchema.safeParse([{...interfaces[0],capacity:{compressionKn:-1,upliftKn:null,
    horizontalShearKn:null,source:"Referência de cálculo",revision:"R1"}}]).success).toBe(false);
 });
});
