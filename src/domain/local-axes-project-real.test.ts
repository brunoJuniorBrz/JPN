import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {m51Project,m51SectionRequest} from "./test-support/m51-project";
import {applyCalculatedSection} from "./apply-calculated-section";
import {projectSchema} from "./models";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {spatialPreparationSchema} from "./spatial-preparation";
import {runLocalSection} from "@/infrastructure/analysis/local-section-runner";
import {runLocalStructuralAssessment} from "@/infrastructure/analysis/local-structural-assessment-runner";

/** C1 in the real project flow: declared preparation -> TypeScript adapter ->
 * capped Python worker -> resistance/LTB assessment. The M51 beam runs along +X
 * with zero roll, where jpn-z-up/1 and the library's own axes coincide, so the
 * explicit contract must reproduce the historical one exactly. */
let legacy:ReturnType<typeof m51Project>,declared:ReturnType<typeof m51Project>;
const payload=(project:unknown)=>JSON.stringify({schema_version:"jpn.structural-assessment/1",project});
beforeAll(async()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const geometric=await runLocalSection(JSON.stringify(m51SectionRequest));
  legacy=projectSchema.parse(await applyCalculatedSection(m51Project(),"V",m51SectionRequest,geometric.result));
  declared=structuredClone(legacy);
  declared.workspace.spatialPreparation!.localAxes={convention:"jpn-z-up/1",source:"C1 test: reviewed roll of piece V against jpn-z-up/1",revision:"C1-1"};
},60000);
afterAll(()=>vi.unstubAllEnvs());

it("the axis reference is an explicit, sourced declaration and never a default",()=>{
  expect(legacy.workspace.spatialPreparation!.localAxes).toBeUndefined();
  const draft=declared.workspace.spatialPreparation!;
  expect(()=>spatialPreparationSchema.parse({...draft,localAxes:{convention:"pynite-y-up",source:"x",revision:"1"}})).toThrow();
  expect(()=>spatialPreparationSchema.parse({...draft,localAxes:{convention:"jpn-z-up/1"}})).toThrow();
});
it("a declaration without source and revision of the roll review blocks the analysis",async()=>{
  const blank=structuredClone(declared);blank.workspace.spatialPreparation!.localAxes={convention:"jpn-z-up/1",source:" ",revision:"C1-1"};
  await expect(adaptLoadedMixedProject(blank)).rejects.toThrow(/LOCAL_AXES_REVIEW/);
});

it("without the declaration the adapter still emits the historical /2 request; with it, /3 differs only by the reference",async()=>{
  const a=await adaptLoadedMixedProject(legacy),b=await adaptLoadedMixedProject(declared);
  expect(a.request.schema_version).toBe("jpn.mixed3d/2");expect("local_axes" in a.request).toBe(false);
  expect(b.request.schema_version).toBe("jpn.mixed3d/3");
  if(b.request.schema_version!=="jpn.mixed3d/3")throw Error("expected /3");
  expect(b.request.local_axes).toBe("jpn-z-up/1");
  // The declaration is part of the hashed preparation: the two revisions can never be confused.
  expect(b.preparation_sha256).not.toBe(a.preparation_sha256);expect(b.input_sha256).not.toBe(a.input_sha256);
  const physical=(r:typeof a.request|typeof b.request)=>{const {schema_version,project,...rest}=r as typeof r&{local_axes?:string};void schema_version;void project;delete (rest as {local_axes?:string}).local_axes;return rest;};
  expect(physical(b.request)).toEqual(physical(a.request));
});

it("M51 regression: the same beam assessed through /3 gives the same demands and elastic LTB reference",async()=>{
  const a=await runLocalStructuralAssessment(payload(legacy)),b=await runLocalStructuralAssessment(payload(declared));
  expect(b.lateralTorsional.map(x=>x.status)).toEqual(a.lateralTorsional.map(x=>x.status));
  expect(b.lateralTorsional.map(x=>x.status)).toEqual(["CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","CALCULATED_ELASTIC_REFERENCE","BLOCKED"]);
  for(const [i,attempt] of b.lateralTorsional.entries()){
    const other=a.lateralTorsional[i];
    if(attempt.status!=="CALCULATED_ELASTIC_REFERENCE"||other.status!=="CALCULATED_ELASTIC_REFERENCE")continue;
    // Mcr depends only on the section analysis, which is re-run per assessment. That existing
    // worker is not bit-reproducible between identical runs (J and Iw move by ~5e-12 relative,
    // measured on the unchanged M51 worker), so this is a roundoff comparison, not a physics one.
    expect(Math.abs(attempt.result.criticalMomentNm/other.result.criticalMomentNm-1)).toBeLessThan(1e-9);
    expect(attempt.result.momentNm).toBeCloseTo(other.result.momentNm,9);
    expect(attempt.result.status).toBe(other.result.status);
    expect(attempt.result.designResistance).toBeNull();
    // Different contract and preparation => different bound hashes, never a reused result.
    expect(attempt.result.binding.analysisInputSha256).not.toBe(other.result.binding.analysisInputSha256);
  }
  for(const r of [a,b])expect(r).toMatchObject({computedStructuralApproval:false,fabricationRelease:false,releaseGate:"NOT_READY_BLOCKED"});
},120000);
