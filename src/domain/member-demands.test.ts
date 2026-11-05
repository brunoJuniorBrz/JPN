import { beforeAll, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { extractMemberDemands, type DemandInput } from "./member-demands";
import { anyMixedRequestSchema, anyMixedResultSchema, selfWeightOverlapReviewBasis } from "./structural-loading";
import { mixedInputHash } from "./mixed-analysis";
import { buildResistanceReport, assertResistanceReportCurrent, axialMeanStressMPa } from "./resistance-report";
import { resistancePreparationSchema } from "./resistance-preparation";
import { windReferenceProject } from "./examples/wind-project";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { projectSchema, emptySnapshot } from "./models";
import { parseBackup, serializeBackup } from "@/infrastructure/persistence/local";

const source="Independent synthetic M23 test, not a code design",release=[false,false,false,false,false,false];
function solve(request:unknown){
  const python=process.env.JPN_PYTHON_EXECUTABLE||path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python");
  const out=JSON.parse(execFileSync(python,["-I","-X","utf8",path.resolve("engine/local_mixed_worker.py")],{input:JSON.stringify(request),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1",MKL_NUM_THREADS:"1"},maxBuffer:8000000}));
  expect(out.status).toBe("completed");return anyMixedResultSchema.parse(out.result);
}
async function fixture(axial=false,version=2){
  const nodes=axial?[{id:"A",x_m:0,y_m:0,z_m:0},{id:"B",x_m:0,y_m:3,z_m:0},{id:"C",x_m:0,y_m:5,z_m:0}]:[{id:"A",x_m:0,y_m:0,z_m:0},{id:"D",x_m:0,y_m:3,z_m:0},{id:"B",x_m:0,y_m:4,z_m:0},{id:"C",x_m:1,y_m:4,z_m:0}];
  const frame=(id:string,start:string,end:string)=>({id,kind:"frame",start,end,material:"M",section:"S",rotation_deg:37,release_start:release,release_end:release});
  const members=axial?[frame("BEAM","A","B"),{id:"X",kind:"axial",start:"B",end:"C",e_pa:200e9,area_m2:.001,source,revision:"1"}]:[frame("F1","A","D"),frame("F2","D","B"),{id:"X",kind:"axial",start:"B",end:"C",e_pa:200e9,area_m2:.001,source,revision:"1"}];
  const cases=axial?[{id:"T",source}]:[{id:"P",source},{id:"T",source}];
  const combinations=axial?[{id:"TENSION",factors:{T:1}},{id:"COMPRESSION",factors:{T:-2}}]:[{id:"C1",factors:{P:1,T:1}},{id:"C2",factors:{P:2,T:.1}},{id:"C3",factors:{P:-1,T:-2}}];
  const request=anyMixedRequestSchema.parse({schema_version:`jpn.mixed3d/${version}`,units:"SI",theory:"linear-elastic-frame-axial",project:{id:"M23-CONTROL",revision:"1",source},nodes,members,
    materials:[{id:"M",e_pa:200e9,g_pa:200e9/2.6,nu:.3,source,revision:"1"}],sections:[{id:"S",area_m2:.01,iy_m4:1e-5,iz_m4:1e-5,j_m4:1e-5,source,revision:"1"}],
    supports:axial?[{node:"A",restrained:[true,true,true,true,true,true]},{node:"B",restrained:[true,true,true,true,true,true]},{node:"C",restrained:[true,false,true,false,false,false]}]:[{node:"A",restrained:[true,true,true,true,true,true]},{node:"C",restrained:[true,true,true,false,false,false]}],cases,combinations,
    nodal_loads:[{node:axial?"C":"B",case:"T",fx_n:0,fy_n:1000,fz_n:0,mx_nm:0,my_nm:0,mz_nm:0},...(!axial&&version===1?[{node:"B",case:"P",fx_n:0,fy_n:0,fz_n:-100,mx_nm:0,my_nm:0,mz_nm:0}]:[])],
    ...(version===2?{member_loads:axial?[]:["F1","F2"].map(member=>({id:`P:${member}`,member,case:"P",coordinate_system:"global",force_per_length_n_m:[0,0,-100],source,revision:"1"})),self_weight:null}:{}),
  });
  const mapping={schema_version:"jpn.geometry-physical-map/1" as const,units:"mm" as const,geometrySignature:"synthetic",junctions:[],nodes:nodes.map(n=>({id:n.id,x:n.x_m*1000,y:n.y_m*1000,z:n.z_m*1000})),members:members.map((m)=>{
    const a=nodes.find(n=>n.id===m.start)!,b=nodes.find(n=>n.id===m.end)!,lengthMm=1000*Math.hypot(b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m);
    return {id:m.id,originalId:m.id==="F1"||m.id==="F2"?"BEAM":m.id,start:m.start,end:m.end,lengthMm,t0:m.id==="F2"?.75:0,t1:m.id==="F1"?.75:1,originalStart:m.id!=="F2",originalEnd:m.id!=="F1"};
  })};
  const prepared:DemandInput={request,mapping,input_sha256:await mixedInputHash(request),preparation_sha256:"f".repeat(64)};
  return {prepared,result:solve(request)};
}
let beam:Awaited<ReturnType<typeof fixture>>,rod:Awaited<ReturnType<typeof fixture>>,legacy:Awaited<ReturnType<typeof fixture>>;
beforeAll(async()=>{beam=await fixture();rod=await fixture(true);legacy=await fixture(false,1);},20000);

it("pórtico segmentado real: N/V/M, flecha e rotação contra balanço analítico independente",async()=>{
  const d=await extractMemberDemands(beam.prepared,beam.result),p=d.pieces.find(p=>p.pieceId==="BEAM")!;
  expect(p.segments).toHaveLength(2);expect(p.samples).toHaveLength(30);expect(p.lengthM).toBe(4);expect(p.axes?.rotationDeg).toBe(37);
  const rows=p.samples.filter(s=>s.combinationId==="C1");expect(rows.map(s=>s.originalPositionM)).toEqual([0,.75,1.5,2.25,3,3,3.25,3.5,3.75,4]);
  for(const r of rows){
    const x=r.originalPositionM;expect(r.forces.nN).toBeCloseTo(1000,6);
    expect(Math.hypot(r.forces.vyN!,r.forces.vzN!)).toBeCloseTo(100*(4-x),6);
    expect(Math.hypot(r.forces.myNm!,r.forces.mzNm!)).toBeCloseTo(100*(4-x)**2/2,6);
    const I=1e-5,E=200e9;expect(Math.hypot(...r.translationLocalM!.slice(1))).toBeCloseTo(100*x*x*(6*4**2-4*4*x+x*x)/(24*E*I),11);
  }
  const end=p.kinematics.find(k=>k.segmentId==="F2"&&k.combinationId==="C1")!.end;
  expect(end.translation_m[2]).toBeCloseTo(-100*4**4/(8*200e9*1e-5),11);expect(end.rotation_rad[0]).toBeCloseTo(-100*4**3/(6*200e9*1e-5),11);
  expect(d.sampling.continuousExtremaLocated).toBe(false);
});
it("máximos de combinações diferentes conservam vetores concomitantes e não fabricam interação",async()=>{
  const p=(await extractMemberDemands(beam.prepared,beam.result)).pieces.find(p=>p.pieceId==="BEAM")!,row=(id:string)=>p.samples.find(s=>s.id===id)!;
  expect(row(p.critical.nN!.maximum).combinationId).toBe("C1");expect(row(p.critical.nN!.minimum).combinationId).toBe("C3");
  const bending=row(p.critical.myNm!.absolute);expect(bending.combinationId).toBe("C2");expect(bending.forces.nN).toBeCloseTo(100,6);
  expect(Math.abs(row(p.critical.nN!.maximum).forces.myNm!)).toBeLessThan(Math.abs(bending.forces.myNm!));
  const r1=p.samples.find(s=>s.combinationId==="C1"&&s.segmentId==="F1"&&s.stationIndex===0)!,r2=p.samples.find(s=>s.combinationId==="C2"&&s.segmentId==="F1"&&s.stationIndex===0)!;
  expect(r2.forces.myNm).toBeCloseTo(2*r1.forces.myNm!,6);expect(r2.forces.nN).toBeCloseTo(.1*r1.forces.nN,6);
});
it("axial real: sinal, extensão, rotações inativas e componentes não aplicáveis",async()=>{
  const p=(await extractMemberDemands(rod.prepared,rod.result)).pieces.find(p=>p.pieceId==="X")!;
  expect(p.samples).toHaveLength(4);expect(p.axes).toBeNull();expect(p.critical.myNm).toBeNull();
  for(const r of p.samples){expect(r.forces.nN).toBeCloseTo(r.combinationId==="TENSION"?1000:-2000,6);for(const k of ["vyN","vzN","tNm","myNm","mzNm"] as const)expect(r.forces[k]).toBeNull();expect(r.translationLocalM).toBeNull();}
  const k=p.kinematics.find(k=>k.combinationId==="TENSION")!;expect(k.end.active_rotations).toBe(false);expect(k.end.translation_m[1]).toBeCloseTo(1000*2/(200e9*.001),12);
});
it("v1 nodal continua extraindo cinco estações sem usar recuperação de UDL",async()=>{
  const p=(await extractMemberDemands(legacy.prepared,legacy.result)).pieces.find(p=>p.pieceId==="BEAM")!;
  for(const r of p.samples.filter(r=>r.combinationId==="C1")){expect(Math.hypot(r.forces.myNm!,r.forces.mzNm!)).toBeCloseTo(100*(4-r.originalPositionM),6);expect(r.translationLocalM).toBeNull();}
});
it("recusa hash, versões, mapeamentos e amostras corrompidos; NaN e infinito",async()=>{
  await expect(extractMemberDemands(beam.prepared,{status:"failed",error:{code:"UNSTABLE"}})).rejects.toThrow();
  await expect(extractMemberDemands(beam.prepared,legacy.result)).rejects.toThrow(/versão/);
  const bad=structuredClone(beam.prepared);bad.input_sha256="0".repeat(64);await expect(extractMemberDemands(bad,beam.result)).rejects.toThrow(/hash/);
  for(const edit of [
    (p:DemandInput)=>{p.mapping.members.pop();},(p:DemandInput)=>{p.mapping.members[1].t0=.5;},(p:DemandInput)=>{p.mapping.members[1].originalId="WRONG";},
    (p:DemandInput)=>{p.mapping.members[0].lengthMm=4000;},(p:DemandInput)=>{p.mapping.nodes[0].x=1;},
  ]){const p=structuredClone(beam.prepared);edit(p);await expect(extractMemberDemands(p,beam.result)).rejects.toThrow(/DEMAND_TRACE_INVALID/);}
  const result=structuredClone(beam.result);if(result.schema_version!=="jpn.mixed3d-result/2")throw Error("Expected v2");
  const frame=result.combinations.C1.members.F1;if(frame.kind!=="frame")throw Error("Expected frame");frame.stations[1].x_m=2;
  await expect(extractMemberDemands(beam.prepared,result)).rejects.toThrow(/estação/);
  for(const invalid of [NaN,Infinity]){frame.stations[1].n_n=invalid;await expect(extractMemberDemands(beam.prepared,result)).rejects.toThrow();}
});

function declaration(pieceId:string){return resistancePreparationSchema.parse({pieceId,family:"cold-formed",fyMpa:250,fuMpa:400,bucklingYM:2,bucklingZM:3,lateralRestraintM:2,source,revision:"1",sectionProperties:{wyCm3:20,wzCm3:10},restraintDescription:"Condições sintéticas explicitamente declaradas",normativeReference:"ABNT NBR 14762:2010; cláusulas integrais pendentes",profileDesignation:"U enrijecido sintético — não usar em obra",geometry:{version:1,basis:"physical-engineer-declaration",shape:"u-stiffened",dimensionsMm:{height:100,width:50,wallThickness:2,lip:15,insideRadius:3},source,revision:"1"}});}
let roof:ReturnType<typeof windReferenceProject>,prepared:Awaited<ReturnType<typeof adaptLoadedMixedProject>>,result:ReturnType<typeof anyMixedResultSchema.parse>,report:Awaited<ReturnType<typeof buildResistanceReport>>;
beforeAll(async()=>{roof=windReferenceProject();roof.workspace.spatialPreparation!.resistance=[declaration("TE1-V1")];prepared=await adaptLoadedMixedProject(roof);result=solve(prepared.request);report=await buildResistanceReport(roof,prepared,result);},20000);

it("JPN → M22 → Python real → solicitações → relatório: 207 peças, dados físicos e bloqueios normativos",()=>{
  expect(report.demands.pieces).toHaveLength(207);expect(report.pieces).toHaveLength(207);expect(report.approvedForFabrication).toBe(false);expect(report.structureStatus).toBe("NOT_APPROVED_FOR_FABRICATION");
  const p=report.pieces.find(p=>p.pieceId==="TE1-V1")!,demands=report.demands.pieces.find(p=>p.pieceId==="TE1-V1")!;
  expect(p.family).toBe("cold-formed");expect(p.declaration!.geometry!.dimensionsMm.wallThickness).toBe(2);
  expect(p.verifications.some(v=>v.id==="local-distortional")).toBe(true);for(const v of p.verifications){expect(v.status).toBe("pending");expect(v.utilization).toBeNull();expect(v.designResistanceN).toBeNull();expect(v.clauseApplied).toBeNull();}
  for(const s of demands.samples){const expected=s.forces.nN/(p.physicalProperties.areaCm2!*1e-4)/1e6;expect(p.analyticalControls.axialMeanStress.find(v=>v.sampleId===s.id)!.stressMPa).toBe(expected);}
  expect(report.normativeProceduresImplemented).toContain("NBR14762:2010-C.3");expect(report.demands.binding.inputSha256).toBe(prepared.input_sha256);
});
it("mudanças de norma, material, cargas, apoios, giro, perfil e discretização invalidam relatório",async()=>{
  await assertResistanceReportCurrent(report,roof,prepared,result);
  for(const change of [
    (p:typeof roof)=>{p.workspace.spatialPreparation!.resistance![0].normativeReference="Outra edição";},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.groups.purlin.steelGrade="Revisado";},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.groups.purlin.rotationDeg=1;},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.combinations[0].factors.WP=2;},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.supports[0].dofs[0]="free";},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.loading!.wind!.cases[0].dynamicPressurePa=600;},
    (p:typeof roof)=>{p.workspace.spatialPreparation!.resistance![0].bucklingYM=4;},
    (p:typeof roof)=>{p.planning!.purlinSpacingM=1.4;},
  ]){const p=structuredClone(roof);change(p);await expect(assertResistanceReportCurrent(report,p,prepared,result)).rejects.toThrow();}
  const modified=structuredClone(result),c=modified.combinations.WP.members[prepared.request.members[0].id];if(c.kind!=="frame")throw Error("Expected frame");c.end_actions_local[0]+=1;
  await expect(assertResistanceReportCurrent(report,roof,prepared,modified)).rejects.toThrow(/STALE_RESISTANCE_REPORT/);
  const tampered=structuredClone(report);tampered.pieces[0].approved=true as false;await expect(assertResistanceReportCurrent(tampered,roof,prepared,result)).rejects.toThrow(/conteúdo/);
},20000);
it("propriedades inválidas, inconsistências e perfis não identificados permanecem pendentes",async()=>{
  for(const n of [NaN,Infinity,0,-1])expect(resistancePreparationSchema.safeParse({...declaration("P1"),fyMpa:n}).success).toBe(false);
  const p=structuredClone(roof),d=p.workspace.spatialPreparation!;d.resistance![0].fuMpa=100;d.resistance![0].sectionProperties.areaCm2=1e6;d.resistance![0].geometry!.dimensionsMm.wallThickness=60;
  d.loading!.overlapReview!.basis=selfWeightOverlapReviewBasis(d,d.loading!);
  const next=await adaptLoadedMixedProject(p),currentResult=solve(next.request);
  const r=await buildResistanceReport(p,next,currentResult),v=r.pieces.find(v=>v.pieceId==="TE1-V1")!;
  expect(v.dataIssues.join(" ")).toMatch(/fu menor/);expect(v.dataIssues.join(" ")).toMatch(/difere/);expect(v.dataIssues.join(" ")).toMatch(/Espessura incompatível/);expect(v.approved).toBe(false);
  expect(r.pieces.find(v=>v.pieceId==="P1")!.dataIssues.join(" ")).toMatch(/Cadastre/);
},20000);
it("cadastro físico e relatório preservam unidades, backups, hashes e referências não normativas",async()=>{
  const p=projectSchema.parse(roof),restored=parseBackup(serializeBackup({...emptySnapshot(),projects:[p]})).data.projects[0];expect(restored.workspace.spatialPreparation!.resistance).toEqual(p.workspace.spatialPreparation!.resistance);
  const mean=report.pieces.find(p=>p.pieceId==="TE1-V1")!.analyticalControls;
  expect(mean.normative).toBe(false);expect(mean.idealizedReferences.approved).toBe(false);
  expect(report.demands.units).toBe("SI");expect(report.binding.resultSha256).toBe(await mixedInputHash(result));expect(report.reportSha256).toMatch(/^[a-f0-9]{64}$/);
});
it("controle N/A: conversões conhecidas N/kN/cm²/m²/Pa/MPa e limites numéricos",()=>{
  // 10 kN on 10 cm² = 10 MPa; 5 kN compression on 2 cm² = -25 MPa.
  expect(axialMeanStressMPa(10000,10)).toBe(10);expect(axialMeanStressMPa(-5000,2)).toBe(-25);
  expect(axialMeanStressMPa(20000,10)).toBe(20);expect(axialMeanStressMPa(10000,20)).toBe(5);
  for(const a of [null,0,-1,NaN,Infinity,Number.MIN_VALUE])expect(axialMeanStressMPa(10000,a)).toBeNull();
  expect(axialMeanStressMPa(Infinity,1)).toBeNull();expect(axialMeanStressMPa(NaN,1)).toBeNull();
});
