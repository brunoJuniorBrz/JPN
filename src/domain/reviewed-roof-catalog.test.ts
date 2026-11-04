import { afterEach,expect,it,vi } from "vitest";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { reviewedRoofProject,syntheticReviewedExtract } from "./test-support/m33a-reviewed-fixtures";
import { buildReviewedRoofCatalog } from "./reviewed-roof-catalog";
import { generateNormativeOrigin,generateNormativeOriginTestStudy } from "./normative-origin";
import { loadNormativeOriginFiles } from "@/infrastructure/analysis/normative-origin-files";
import { roofSchema,percent } from "./project-details";

afterEach(()=>vi.unstubAllEnvs());
it("preserves the exact 30-degree slope through project JSON while other percent fields retain their precision rule",()=>{
  const {project}=reviewedRoofProject("mono"),slope=100/Math.sqrt(3);
  expect(roofSchema.parse(JSON.parse(JSON.stringify(project.roof))).slopePercent).toBe(slope);
  expect(percent.safeParse(slope).success).toBe(false);
});
it.each(["mono","gable"] as const)("selects bounded %s geometry, eaves h and all exclusive internal/directional patterns",async typology=>{
  const {project,input}=reviewedRoofProject(typology),extract=syntheticReviewedExtract();
  const catalog=buildReviewedRoofCatalog(project,input,extract);
  expect(catalog.applicability.eavesHeightM).toBe(3);expect(catalog.applicability.speedReferenceHeightM).toBeGreaterThan(3);
  const run=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:extract});
  expect(run.blockers).toEqual([]);expect(run.state).toBe("DECLARED_UNVERIFIED");expect(run.wind!.declaration.cases).toHaveLength(4);
  for(const batch of run.batches)for(const c of batch.combinations){
    expect(Object.entries(c.factors).filter(([id,f])=>id.startsWith("W")&&f!==0).length).toBeLessThanOrEqual(1);
    expect(c.factors.G).toBeGreaterThan(0);
  }
  expect(run.procedures.filter(p=>p.procedure.startsWith("Cpe:")).every(p=>p.state==="DECLARED_UNVERIFIED")).toBe(true);
  expect(run.currentEditionCorrectionsVerified).toBe(false);expect(run.fabricationRelease).toBe(false);expect(run.computedStructuralApproval).toBe(false);
});

it("uses 2025 rare psi1, frequent psi1/psi2, quasi-permanent psi2 and ULS psi0 without mixing resistant factors",()=>{
  const {project,input}=reviewedRoofProject("mono"),v=syntheticReviewedExtract(),d=buildReviewedRoofCatalog(project,input,v).factors;
  const factor=(purpose:string,category:string,role:string,effect="unfavorable")=>d.factors.find(f=>f.purpose===purpose&&f.category===category&&f.role===role&&f.effect===effect)!;
  expect(factor("ULS","wind","accompanying").psi.value).toBe(v.factors.psiWind[0]);
  expect(factor("SLS-characteristic","wind","accompanying").psi.value).toBe(v.factors.psiWind[1]);
  expect(factor("SLS-frequent","variable","leading").psi.value).toBe(v.factors.psiRoofLive[1]);
  expect(factor("SLS-frequent","variable","accompanying").psi.value).toBe(v.factors.psiRoofLive[2]);
  expect(factor("SLS-quasi-permanent","wind","accompanying").psi.value).toBe(0);
  expect(factor("ULS","variable","accompanying","favorable").psi.value).toBe(0);
  expect(factor("ULS","permanent","permanent","favorable").gamma.value).toBe(v.factors.permanentFavorable);
  expect(d.factors.every(f=>f.gamma.source.edition==="2025"&&f.psi.source.standard==="ABNT NBR 8681")).toBe(true);
});

it.each(["slope","aspect","overhang","eaves","incidence","openings","volume","scope","group","actions","edition"])("blocks unimplemented reviewed domain: %s",async kind=>{
  const {project,input}=reviewedRoofProject("gable"),v=syntheticReviewedExtract();
  if(kind==="slope")project.roof.slopePercent=99;
  if(kind==="aspect")project.roof.lengthM=7;
  if(kind==="overhang")project.planning!.overhangStartM=.1;
  if(kind==="eaves")project.roof.lowHeightM=3.01;
  if(kind==="incidence")input.incidencesDeg=[45];
  if(kind==="openings")input.openings.faceAreasM2[0]=.1;
  if(kind==="volume")input.openings.volumeM3+=1;
  if(kind==="scope")delete input.reviewedRoof;
  if(kind==="group")input.speed.s3=.83;
  if(kind==="actions")input.actions[0].factorClass="GROUPED_G";
  if(kind==="edition")(v as {combinationsDocumentSha256:string}).combinationsDocumentSha256="0".repeat(64);
  const r=await generateNormativeOriginTestStudy(project,input,{reviewedExtract:v});
  expect(r.state).toBe("BLOCKED_UNSUPPORTED");expect(r.batches).toEqual([]);
});

it("private configuration has no fallback, disallows repository storage and cannot promote fixture claims",async()=>{
  vi.stubEnv("JPN_NORMATIVE_DATA_DIR",process.cwd());
  expect((await loadNormativeOriginFiles()).loadErrors.join()).toMatch(/DIRECTORY_INVALID/);
  const directory=await mkdtemp(path.join(tmpdir(),"jpn-m33a-catalog-"));
  try{
    vi.stubEnv("JPN_NORMATIVE_DATA_DIR",directory);
    expect((await loadNormativeOriginFiles()).loadErrors.join()).toMatch(/MISSING_OR_INVALID/);
    await writeFile(path.join(directory,"m33a-reviewed-extract.json"),JSON.stringify(syntheticReviewedExtract()));
    const {project,input}=reviewedRoofProject("mono"),files=await loadNormativeOriginFiles();
    expect((await generateNormativeOrigin(project,input,files)).blockers.join()).toMatch(/TEST_ONLY_NOT_NORMATIVE/);
    await writeFile(path.join(directory,"m33a-reviewed-extract.json"),"{");
    expect((await loadNormativeOriginFiles()).loadErrors.join()).toMatch(/FILE_INVALID/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
