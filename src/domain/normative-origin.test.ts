import { afterEach,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { windReferenceProject } from "./examples/wind-project";
import { createQuickProject } from "./quick-project";
import { structureSignature } from "./calculations/project-basis";
import { generateStructure } from "./calculations/structure";
import { generatedRoofRegions } from "./roof-load-path";
import { inspectConnectivity } from "./spatial-connectivity";
import { calculateWindExposure,calculateWindSpeed } from "./wind-speed";
import { buildEngineReleaseGate } from "./engine-release-gate";
import { generateNormativeOrigin,generateNormativeOriginTestStudy,assertNormativeOriginFresh,materializeNormativeOriginStudy,adaptNormativeOriginStudy,normativeEnvelope } from "./normative-origin";
import { normativeWindDataSchema,normativeFactorsDataSchema } from "./normative-origin-contracts";
import { m33aFixture } from "./test-support/m33a-fixtures";
import { runLocalMixed } from "@/infrastructure/analysis/local-mixed-runner";
import { generateNormativeOriginFromRepository } from "@/infrastructure/analysis/normative-origin-files";

afterEach(()=>vi.unstubAllEnvs());
const testRun=generateNormativeOriginTestStudy;
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const close=(a:number[],b:number[],digits=7)=>a.forEach((v,i)=>expect(v).toBeCloseTo(b[i],digits));
const partial=JSON.parse(readFileSync("docs/validation/mission31/external-reference-inputs.json","utf8"));

it("audits recovered original data and partial REF-04/REF-01 without resolving conflicting V0",()=>{
  const inventory=JSON.parse(readFileSync("docs/validation/coldformed-design/supplied-standards.json","utf8"));
  expect(inventory.sources).toHaveLength(5);
  for(const row of partial.cases){const {s2}=calculateWindExposure({heightM:row.heightM,category:row.category,sizeClass:row.sizeClass});expect(Math.abs(s2-row.reportedS2)).toBeLessThan(.5*10**(-row.reportedDecimalPlaces));}
  expect(partial.cases[0].conflictingBasicSpeedsMps).toEqual([45,33]);
  const recovered=JSON.parse(readFileSync("data/normas/nbr6123-2023-speed.json","utf8"));
  expect(recovered.documentSha256).toBe(inventory.sources.find((s:{filename:string})=>s.filename==="NBR-6123-2023.pdf").sha256);
  for(const category of ["I","II","III","IV","V"] as const)for(const sizeClass of ["A","B","C"] as const){
    const row=recovered.exposure.categories[category],index=["A","B","C"].indexOf(sizeClass);
    expect(calculateWindExposure({heightM:10,category,sizeClass}).s2).toBe(row.b[index]*recovered.exposure.frCategoryII[index]);
  }
});

it("retains known speed procedures while missing Cpe/Cpi and 2025 factors block real generation",async()=>{
  const p=windReferenceProject(),{input}=m33aFixture(p),r=await generateNormativeOrigin(p,input);
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.blockers.join(" ")).toMatch(/CPE_CPI_DATA_MISSING/);expect(r.blockers.join(" ")).toMatch(/FACTORS_2025_MISSING/);
  expect(r.procedures[0].state).toBe("SUPPORTED_VERIFIED");expect(r.procedures[1].state).toBe("DECLARED_UNVERIFIED");
  expect(r.currentEditionCorrectionsVerified).toBe(false);
});

it("production rejects TEST_ONLY and imported claims cannot grant verified execution",async()=>{
  const p=windReferenceProject(),f=m33aFixture(p);
  expect((await generateNormativeOrigin(p,f.input,f.files)).blockers.join(" ")).toMatch(/TEST_ONLY_NOT_NORMATIVE/);
  const r=await testRun(p,f.input,f.files);expect(r.state).toBe("DECLARED_UNVERIFIED");
  await expect(assertNormativeOriginFresh(p,f.input,f.files,JSON.parse(JSON.stringify(r)))).rejects.toThrow(/IMPORTED/);
  r.state="BLOCKED_UNSUPPORTED";await expect(assertNormativeOriginFresh(p,f.input,f.files,r)).rejects.toThrow(/EDITED/);
  const relabeled=structuredClone(f.files) as {wind:{origin:string};factors:{origin:string}};
  relabeled.wind.origin=relabeled.factors.origin="OWNER_TRANSCRIPTION";
  expect((await generateNormativeOrigin(p,f.input,relabeled)).blockers.join(" ")).toMatch(/TEST_ONLY/);
  const owner=JSON.parse(JSON.stringify(f.files).replaceAll("TEST_ONLY_NOT_NORMATIVE","OWNER_TRANSCRIPTION"));
  expect((await generateNormativeOrigin(p,f.input,owner)).state).toBe("DECLARED_UNVERIFIED");
  vi.stubEnv("NODE_ENV","production");expect(()=>testRun(p,f.input,f.files)).toThrow(/TEST_ONLY/);
});

it("real repository loader reports missing transcriptions while retaining supplied-source history",async()=>{
  const p=windReferenceProject(),{input}=m33aFixture(p),r=await generateNormativeOriginFromRepository(p,input);
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.procedures.filter(p=>p.state==="BLOCKED_UNSUPPORTED").length).toBe(2);
});

it.each(["missing-cpe","missing-source","slope","incidence","openings","unknown-openings","gap","overlap","duplicate-row","longitudinal-cut","2003-factors","missing-psi","duplicate-factor","missing-ELS","nonzero-absent"])("blocks adversarial catalog/input: %s",async kind=>{
  const p=windReferenceProject(),f=m33aFixture(p);
  switch(kind){
    case "missing-cpe": delete (f.wind.rows[0].zones[0].cpe as {value?:number}).value;break;
    case "missing-source": f.wind.rows[0].zones[0].cpe.source.item="";break;
    case "slope":f.wind.rows[0].domain.slopeDeg+=.1;break;
    case "incidence":f.input.incidencesDeg=[90];break;
    case "openings":f.input.openings.faceAreasM2[0]=2;break;
    case "unknown-openings":f.input.openings.classification="unknown";break;
    case "gap":f.wind.rows[0].zones[0].boundsFraction[2]=.2;break;
    case "overlap":f.wind.rows[0].zones[0].boundsFraction[2]=.3;break;
    case "duplicate-row":f.wind.rows.push(structuredClone(f.wind.rows[0]));break;
    case "longitudinal-cut":f.wind.rows[0].zones[0].boundsFraction=[0,0,1,.123];f.wind.rows[0].zones[1].boundsFraction=[0,.123,1,1];break;
    case "2003-factors":(f.factors.source as {edition:string}).edition="2003";break;
    case "missing-psi":f.factors.factors=[];break;
    case "duplicate-factor":f.factors.factors.push(structuredClone(f.factors.factors[0]));break;
    case "missing-ELS":f.input.purposes.push("SLS-characteristic");break;
    case "nonzero-absent":f.factors.factors.filter(row=>row.role==="absent").forEach(row=>row.gamma.value=1);break;
  }
  const r=await testRun(p,f.input,f.files);expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.blockers.length).toBeGreaterThan(0);
});

for(const typology of ["mono","gable"] as const)it(`conserves force/moment, both pressure signs and two incidences: ${typology}`,async()=>{
  const p=createQuickProject({typology,widthM:6,lengthM:8,heightM:3,slopePercent:25});
  const f=m33aFixture(p,[],[0,90]),r=await testRun(p,f.input,f.files);
  expect(r.state).toBe("DECLARED_UNVERIFIED");expect(r.wind!.distribution.cases).toHaveLength(4);
  const regions=generatedRoofRegions(p).regions,q=calculateWindSpeed(f.input.speed).dynamicPressurePa;
  for(const c of r.wind!.distribution.cases){
    const force=[0,0,0],moment=[0,0,0];
    for(const z of c.zones){
      const plane=regions.find(s=>s.id===z.declaration.regionId)!,[x0,y0,x1,y1]=z.declaration.boundsM;
      const area=(x1-x0)*(y1-y0),net=q*(z.declaration.externalCoefficient-z.declaration.internalCoefficient);
      const v=[net*plane.plane.dzDx*area,net*plane.plane.dzDy*area,-net*area];
      const center=[(x0+x1)/2,(y0+y1)/2,plane.plane.z0M+plane.plane.dzDx*((x0+x1)/2-plane.boundsM[0])+plane.plane.dzDy*((y0+y1)/2-plane.boundsM[1])];
      const m=cross(center,v);v.forEach((x,i)=>force[i]+=x);m.forEach((x,i)=>moment[i]+=x);
    }
    close(c.forceN,force);close(c.momentNm,moment);
  }
  expect(r.wind!.distribution.cases.map(c=>Math.sign(c.forceN[2]))).toEqual([-1,-1,1,1]);
});

it("generates current-edition principal/accompanying, favorable/adverse, exclusions and all ELS recipes in bounded batches",async()=>{
  const p=windReferenceProject(),f=m33aFixture(p,[{caseId:"G",category:"permanent",exclusiveGroup:null,factorClass:"DEAD"},{caseId:"Q",category:"variable",exclusiveGroup:null,factorClass:"LIVE"}]);
  const original=structuredClone(f.factors);
  f.input.purposes=["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"];
  for(const purpose of ["SLS-characteristic","SLS-frequent","SLS-quasi-permanent"] as const){
    f.factors.recipes.push({...original.recipes[0],id:purpose,purpose,leading:purpose==="SLS-quasi-permanent"?"none":"each-variable"});
    f.factors.factors.push(...original.factors.map(row=>({...row,purpose})));
  }
  const r=await testRun(p,f.input,f.files);expect(r.state).toBe("DECLARED_UNVERIFIED");
  const cs=r.batches.flatMap(b=>b.combinations);expect(cs.length).toBeGreaterThan(10);expect(r.batches.every(b=>b.combinations.length<=10)).toBe(true);
  for(const c of cs)expect(!(c.factors.W0_0&&c.factors.W0_1)).toBe(true);
  expect(cs.some(c=>c.factors.G===.5)).toBe(true);expect(cs.some(c=>c.factors.G===2)).toBe(true);expect(cs.some(c=>c.factors.Q===1)).toBe(true);
  const factorTrace=r.procedures.find(p=>p.procedure.startsWith("factor:"))!;
  expect(factorTrace.source).toHaveProperty("gamma.source.documentSha256","0".repeat(64));expect(factorTrace.source).toHaveProperty("psi.source.edition","2025");
  const uls=new Set(r.batches.flatMap(b=>b.declaration.combinations.filter(c=>c.purpose==="ULS").map(c=>c.id)));
  const values=cs.filter(c=>uls.has(c.id)).map((c,i)=>({combinationId:c.id,value:i===1?-100:i}));
  const envelope=await normativeEnvelope(r,"ULS",values);expect(envelope.minimum).toEqual(values[1]);expect(envelope.maximumAbsolute).toEqual(values[1]);expect(envelope.signature).toBe(r.signature);
  await expect(normativeEnvelope(r,"ULS",values.slice(1))).rejects.toThrow(/COVERAGE/);
});

it.each(["geometry","actions","parameters","catalog"])("invalidates the origin signature on %s",async kind=>{
  const p=windReferenceProject(),f=m33aFixture(p),r=await testRun(p,f.input,f.files);
  if(kind==="geometry")p.roof.widthM!+=1;
  if(kind==="actions")p.workspace.spatialPreparation!.cases[0].source+=" revised action";
  if(kind==="parameters")f.input.speed.s3=.9;
  if(kind==="catalog")f.wind.revision="2";
  await expect(assertNormativeOriginFresh(p,f.input,f.files,r)).rejects.toThrow(/STALE/);
});

it("rejects imported verification flags, editions and missing per-value provenance",()=>{
  const f=m33aFixture(windReferenceProject());
  expect(()=>normativeWindDataSchema.parse({...f.wind,status:"SUPPORTED_VERIFIED"})).toThrow();
  expect(()=>normativeFactorsDataSchema.parse({...f.factors,status:"SUPPORTED_VERIFIED"})).toThrow();
  (f.factors.factors[0].gamma.source as {edition:string}).edition="2003";expect(()=>normativeFactorsDataSchema.parse(f.factors)).toThrow();
});

it("blocks excessive combination expansion rather than truncating scenarios",async()=>{
  const p=windReferenceProject(),actions=Array.from({length:6},(_,i)=>({caseId:`G${i}`,category:"permanent" as const,exclusiveGroup:null,factorClass:`DEAD${i}`}));
  const f=m33aFixture(p,actions,[0,90]);f.factors.recipes[0].includePermanentOnly=true;
  const r=await testRun(p,f.input,f.files);expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.blockers.join(" ")).toMatch(/COMBINATION_LIMIT_256/);expect(r.batches).toEqual([]);
});

it("materializes reviewable combinations without granting the existing overlap review",async()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!,old=d.engineeringCombinations!;
  const base=old.actions.filter(a=>a.category!=="wind");
  d.cases=d.cases.filter(c=>base.some(a=>a.caseId===c.id));d.loading!.wind=undefined;
  const f=m33aFixture(p,base.map(a=>({caseId:a.caseId,category:a.category,exclusiveGroup:a.exclusiveGroup,factorClass:"DEAD"})));
  const r=await testRun(p,f.input,f.files),before=JSON.stringify(p),materialized=await materializeNormativeOriginStudy(p,f.input,f.files,r);
  expect(JSON.stringify(p)).toBe(before);expect(materialized.projects[0].workspace.spatialPreparation!.engineeringCombinations!.normativeValidation).toBe("pending-engineer-review");
  await expect(adaptNormativeOriginStudy(p,f.input,f.files,r)).rejects.toThrow(/POSSIBLE_DOUBLE_COUNT/);
});

it("gate remains NOT_READY_BLOCKED even after an origin study",()=>{
  const gate=buildEngineReleaseGate(windReferenceProject(),{binding:{claimedApproval:true},continuousDemands:{},wholePieceDeflections:{},serviceChecks:[]});
  expect(gate.status).toBe("NOT_READY_BLOCKED");expect(gate.computedStructuralApproval).toBe(false);expect(gate.fabricationRelease).toBe(false);
});

for(const typology of ["mono","gable"] as const)it(`TEST_ONLY normative file -> purlins -> combinations -> native solver: ${typology}`,async()=>{
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!;
  p.planning!.typology=typology;
  // Isolate the wind chain; permanent/accompanying arithmetic is tested above.
  d.cases=[];d.combinations=[];d.engineeringCombinations=undefined;d.loading!.wind=undefined;
  d.loads=[];d.loading!.roofArea=[];d.loading!.uniform=[];d.loading!.selfWeight=null;
  const f=m33aFixture(p);
  // Keep actual reference supports/groups/connections, refresh only the geometry association.
  const model=generateStructure(p).model!;
  const ids=new Set(model.nodes.map(n=>n.id));d.supports=d.supports.filter(s=>ids.has(s.nodeId));
  Object.assign(d,{geometrySignature:structureSignature(p)});
  d.connectivity={version:1,geometrySignature:d.geometrySignature,reviewSource:"TEST_ONLY_NOT_NORMATIVE explicit connected-joint test model",
    junctions:inspectConnectivity(model).junctions.map(j=>({nodeId:j.nodeId,pieceIds:j.pieceIds,decision:"connect"}))};
  const run=await testRun(p,f.input,f.files);expect(run.state).toBe("DECLARED_UNVERIFIED");
  const adapted=await adaptNormativeOriginStudy(p,f.input,f.files,run);
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  for(const a of adapted.prepared){const out=await runLocalMixed(JSON.stringify(a.request));
    if(out.status!=="completed"||out.result.schema_version!=="jpn.mixed3d-result/2")throw Error("Native solver did not complete");
    for(const c of a.request.combinations){
      const solved=out.result.combinations[c.id],reactions=[0,0,0],moments=[0,0,0],expected=[0,0,0],expectedMom=[0,0,0];
      for(const action of a.wind_load_path!.cases){const factor=c.factors[action.caseId]??0;action.forceN.forEach((v,i)=>expected[i]-=factor*v);action.momentNm.forEach((v,i)=>expectedMom[i]-=factor*v);}
      for(const load of a.request.nodal_loads){const factor=c.factors[load.case]??0,node=a.request.nodes.find(n=>n.id===load.node)!;
        const force=[load.fx_n,load.fy_n,load.fz_n],moment=[load.mx_nm,load.my_nm,load.mz_nm];
        force.forEach((v,i)=>expected[i]-=factor*v);const m=cross([node.x_m,node.y_m,node.z_m],force);m.forEach((v,i)=>expectedMom[i]-=factor*(v+moment[i]));}
      for(const node of a.request.nodes){const r=solved.nodes[node.id],m=cross([node.x_m,node.y_m,node.z_m],r.reaction_force_n);r.reaction_force_n.forEach((v,i)=>reactions[i]+=v);r.reaction_moment_nm.forEach((v,i)=>moments[i]+=v+m[i]);}
      close(reactions,expected,5);close(moments,expectedMom,4);expect(solved.equilibrium.relative_residual).toBeLessThan(1e-8);
      expect(Object.keys(solved.members).length).toBe(a.request.members.length);
    }
  }
},20000);
