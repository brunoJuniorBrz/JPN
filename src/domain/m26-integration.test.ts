import { expect,it } from "vitest";
import { coldFormedDiagnostics,coldFormedPropertySchema,coldFormedQuantityKeys } from "./cold-formed-properties";
import { connectionTransferGeometrySchema } from "./connection-transfer-geometry";
import { resistancePreparationSchema } from "./resistance-preparation";
import { buildPreproductionDossier } from "./calculations/preproduction";
import { emptyPhysicalGroup } from "./physical-declaration";
import { windReferenceProject } from "./examples/wind-project";
import { emptySnapshot,projectSchema } from "./models";
import { parseBackup,serializeBackup } from "@/infrastructure/persistence/local";
import { referenceCandidateGate } from "./reference-candidate-gate";
import candidates from "../../docs/validation/normative/reference-candidates.json";

const source="Synthetic dimensional consistency test, not a section certificate",q=(value:number,resolution=.001)=>({value,resolution});
function physical(){return coldFormedPropertySchema.parse({schema_version:"jpn.cold-formed-properties/1",source,revision:"1",responsible:source,sectionOriginDescription:"Synthetic cross-section drawing origin, mm",dimensionsBasis:"external-steel-dimensions",axes:"solver-local-yz-centroidal-principal",...Object.fromEntries(coldFormedQuantityKeys.map(k=>[k,q(1)])),nominalThicknessMm:q(2),effectiveThicknessMm:q(1.9),flatWebMm:q(90),flatFlangeMm:q(40),flatLipMm:q(10),areaCm2:q(10),iyCm4:q(40),izCm4:q(90),iyzCm4:q(0),radiusYMm:q(20),radiusZMm:q(30),effectiveSection:{areaCm2:q(8),wyCm3:q(10),wzCm3:q(10),method:source,stressState:source,source,revision:"1"},restraints:[{positionM:0,flange:"both",lateral:true,torsional:true,source,revision:"1"}],warpingStart:"free",warpingEnd:"restrained"});}
function declaration(){return resistancePreparationSchema.parse({pieceId:"P1",family:"cold-formed",fyMpa:250,fuMpa:400,bucklingYM:4,bucklingZM:4,lateralRestraintM:4,source,revision:"1",sectionProperties:{},restraintDescription:source,normativeReference:"NBR 14762:2010; full clauses unavailable",geometry:{version:1,basis:"physical-engineer-declaration",shape:"u-stiffened",dimensionsMm:{height:100,width:50,lip:15,wallThickness:2,insideRadius:3},source,revision:"1"},coldFormed:physical()});}
const group={...emptyPhysicalGroup(),eGpa:200,gGpa:200/2.6,nu:.3,areaCm2:10,iyCm4:40,izCm4:90,jCm4:1};
it("Ue: resolução dimensional, r²=I/A e conversão cm→mm; preenchimento não aprova norma",()=>{
  const d=declaration(),a=coldFormedDiagnostics(d,group,4);expect(a.status).toBe("pending-normative-source");expect(a.issues).toEqual([]);
  d.coldFormed!.radiusYMm=q(2);expect(coldFormedDiagnostics(d,group,4).issues.some(x=>x.code==="RADIUS_MISMATCH")).toBe(true);
  d.coldFormed!.areaCm2=q(10.001,.01);expect(coldFormedDiagnostics(d,group,4).issues.some(x=>x.code==="SOLVER_PROPERTY_MISMATCH")).toBe(false);
  d.coldFormed!.areaCm2=q(11,.01);expect(coldFormedDiagnostics(d,group,4).issues.some(x=>x.code==="SOLVER_PROPERTY_MISMATCH")).toBe(true);
});
it("Ue incompleto, família incompatível, contenção órfã, espessura/dobras e material incoerentes bloqueados",()=>{
  const d=declaration();delete d.coldFormed;expect(coldFormedDiagnostics(d,group,4).status).toBe("pending-data");
  d.geometry!.dimensionsMm.lip=100;expect(coldFormedDiagnostics(d,group,4).issues.some(x=>x.code==="INCOMPATIBLE_GEOMETRY")).toBe(true);
  d.family="rolled";expect(coldFormedDiagnostics(d,group,4).status).toBe("unsupported-model");
  const p=declaration();p.coldFormed!.effectiveThicknessMm=q(3);p.coldFormed!.flatFlangeMm=q(5);p.coldFormed!.restraints[0].positionM=5;p.coldFormed!.warpingStart="pending";
  const codes=coldFormedDiagnostics(p,{...group,gGpa:1},4).issues.map(x=>x.code);expect(codes).toEqual(expect.arrayContaining(["INCOHERENT_THICKNESS","FLAT_WIDTH_MISMATCH","MISSING_RESTRAINT","ORPHAN_RESTRAINT","MATERIAL_INCOHERENT"]));
  for(const n of [0,-1,Infinity,NaN])expect(coldFormedPropertySchema.safeParse({...physical(),areaCm2:q(n)}).success).toBe(false);
});
it("M22/M24 + propriedades novas preservam M25, backup e estados preliminares",()=>{
  const p=windReferenceProject(),before=buildPreproductionDossier(p);p.workspace.spatialPreparation!.resistance=[declaration()];
  const restored=parseBackup(serializeBackup({...emptySnapshot(),projects:[projectSchema.parse(p)]})).data.projects[0];
  expect(restored.workspace.spatialPreparation!.resistance![0].coldFormed).toEqual(physical());expect(buildPreproductionDossier(restored)).toEqual(before);
  expect(before.approvedForFabrication).toBe(false);expect(before.pieces).toHaveLength(207);
});
it("furação estruturada não deriva áreas de texto; duplicados, referências e área líquida inválida bloqueados",()=>{
  const input={schema_version:"jpn.connection-transfer-geometry/1",source,revision:"1",coordinateReference:source,units:"mm",fixing:"pending",holes:[],pitches:[],grossAreaMm2:null,netAreaMm2:null,netSectionPath:null,loadTransferPath:null,eccentricityMm:null};
  expect(connectionTransferGeometrySchema.parse(input).netAreaMm2).toBeNull();expect(connectionTransferGeometrySchema.safeParse({...input,grossAreaMm2:10,netAreaMm2:11}).success).toBe(false);
  expect(connectionTransferGeometrySchema.safeParse({...input,pitches:[{fromHole:"A",toHole:"B",distanceMm:2}]}).success).toBe(false);
});
it("cinco candidatos não são goldens; unidade suspeita continua em quarentena, sem resistência gabarito",()=>{
  expect(candidates.references).toHaveLength(5);for(const ref of candidates.references)expect(referenceCandidateGate(ref).comparisonAllowed).toBe(false);
  for(const ref of candidates.references.filter(r=>r.status.startsWith("quarantined"))){expect(referenceCandidateGate({...ref,usable_for_pass_fail:true}).reason).toBe("QUARANTINED_REFERENCE_UNITS_OR_METHOD");}
});
