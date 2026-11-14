import {expect,it,vi} from "vitest";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {roofProject} from "./test-support/m42-roof-fixture";
import {applyNbr6120Actions} from "./nbr6120-actions";
import {applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {buildResistanceReport} from "./resistance-report";
import {buildMemberCombinationMatrix,fitSegmentForceField,requiredChecks} from "./member-combination-matrix";
import type {DesignExecution,ResistanceStandard} from "./member-combination-matrix";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";

const python=()=>{
  const portable=path.resolve(".tools/python/python.exe");
  return process.env.JPN_PYTHON_EXECUTABLE||(existsSync(portable)?portable:path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python"));
};
const SCRIPT="import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom jpn_structural.steel_i_design import analyze_steel_i_design\nprint(json.dumps(analyze_steel_i_design(json.load(sys.stdin))))";
const design=(request:unknown)=>JSON.parse(execFileSync(python(),["-I","-X","utf8","-c",SCRIPT,path.resolve("engine")],
  {input:JSON.stringify(request),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1"}}));
const F=(o:object)=>({nN:0,vyN:0,vzN:0,tNm:0,myNm:0,mzNm:0,...o}) as {nN:number;vyN:number|null;vzN:number|null;tNm:number|null;myNm:number|null;mzNm:number|null};

it("requiredChecks por norma: NBR 8800 usa my/mz sem divisão de sinal, 5.5.1.2 e não tem 9.8.4",()=>{
  expect(requiredChecks([F({nN:-5,myNm:3,vzN:2})],"NBR8800").sort()).toEqual(["combined-5.5.1.2","compression","compression-slenderness","my","shear_z"]);
  expect(requiredChecks([F({myNm:3}),F({myNm:-3})],"NBR8800")).toEqual(["my"]);
  expect(requiredChecks([F({nN:-5,myNm:3,vzN:2})],"NBR14762")).toContain("bending-shear-9.8.4");
  expect(requiredChecks([F({tNm:1})],"NBR8800")).toEqual(["unsupported-tNm"]);
});

const SECTION={family:"welded",shape:"i-h-doubly-symmetric",d_m:.4,bf_m:.2,tf_m:.016,tw_m:.008,fy_pa:345e6,fu_pa:450e6,e_pa:200e9,g_pa:77e9,properties:null,fillet_radius_m:null,
  source:"Seção I soldada sintética explícita do ensaio M44-P2, não comercial",revision:"1"};

it("NBR 6120 + NBR 8681 + PyNite + NBR 8800 (I soldado): matriz peça × combinação ELU com demanda, resistência, utilização e cláusula",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const r6=applyNbr6120Actions(roofProject(),{schema_version:"jpn.nbr6120-roof-actions/1",
    permanent:[{kind:"roof-cladding",caseId:"TELHA",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"}],roofLiveLoad:{caseId:"SC"}});
  const {project,generated}=applyNbr8681Combinations(r6.project,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets:["unfavorable"],families:["uls-normal"],actions:[{nature:"permanent",caseId:"ZERO",permanentType:"steel-and-equipment"},...r6.nbr8681Actions]});
  const uls=generated.trace.map(c=>c.id);
  const sp=project.workspace.spatialPreparation!;
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio M44-P2: ações independentes",revision:"M44-P2 v1",
    basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  const prepared=await adaptLoadedMixedProject(project);
  const solved=await runLocalMixed(JSON.stringify(prepared.request));
  if(solved.status!=="completed")throw Error("PyNite não analisou");
  const demands=(await buildResistanceReport(project,prepared,solved.result)).demands;
  const executions:DesignExecution[]=[],fits=new Map<string,ReturnType<typeof fitSegmentForceField>[]>(),results=new Map<string,ReturnType<typeof design>>();
  for(const piece of demands.pieces)for(const cid of uls){
    const segs=piece.segments.map(seg=>{
      const rows=piece.samples.filter(s=>s.segmentId===seg.id&&s.combinationId===cid).sort((a,b)=>a.stationIndex-b.stationIndex);
      return {seg,forces:fitSegmentForceField(rows.map((r,i)=>({u:i/(rows.length-1),forces:r.forces})))};
    });
    fits.set(piece.pieceId+"/"+cid,segs.map(x=>x.forces));
    const result=design({schema_version:"jpn.steel-i-design/1",units:"SI",piece_id:piece.pieceId,combination_id:cid,combination_kind:"normal",
      binding:{mechanical_sha256:"a".repeat(64),analysis_input_sha256:demands.binding.inputSha256,analysis_result_sha256:demands.binding.resultSha256},
      section:{...SECTION,effective_length_x_m:piece.lengthM,effective_length_y_m:piece.lengthM,effective_length_z_m:piece.lengthM,unbraced_length_m:piece.lengthM},
      tension:{basis:"no-holes-all-elements-connected",source:"Sem furos (ensaio)",revision:"1"},web:{transverse_stiffener_spacing_m:null},
      fields:segs.map(x=>({segment_id:x.seg.id,offset_m:x.seg.t0*piece.lengthM,length_m:x.seg.lengthMm/1000,forces:x.forces}))});
    results.set(piece.pieceId+"/"+cid,result);
    expect(result.computed_structural_approval).toBe(false);
    executions.push({pieceId:piece.pieceId,combinationId:cid,checks:result.checks});
  }
  const pieceStandards:Record<string,ResistanceStandard>=Object.fromEntries(demands.pieces.map(p=>[p.pieceId,"NBR8800" as const]));
  const matrix=buildMemberCombinationMatrix({engineeringCombinations:sp.engineeringCombinations!,demands,executions,pieceStandards});
  expect(matrix.standardsUsed).toEqual(["ABNT NBR 8681:2025","ABNT NBR 8800:2024 (Errata 1:2025)"]);
  expect(matrix.releaseGate).toBe("NOT_READY_BLOCKED");
  expect(matrix.rows).toHaveLength(5*uls.length);
  const purlinRows=matrix.rows.filter(r=>["P1","P2","P3"].includes(r.pieceId));
  expect(purlinRows.every(r=>r.status==="CONDITIONAL"&&r.resistanceStandard==="NBR8800")).toBe(true);
  expect(matrix.rows.filter(r=>r.status==="no-demand").map(r=>r.pieceId).sort()).toEqual(["TC1","TC1","TC2","TC2"]);
  // independent hand values (welded I d=.4 bf=.2 tf=.016 tw=.008, fy=345 MPa): Vrd = 0,6 d tw fy / 1,10 and Mpl/1,10 cap
  const zx=.2*.016*(.4-.016)+.008*.368**2/4,wx=(2*(.2*.016**3/12+.2*.016*((.4-.016)/2)**2)+.008*.368**3/12)/.2;
  const vrd=.6*.4*.008*345e6/1.10;
  for(const row of purlinRows){
    for(const c of row.executedChecks){
      expect(c.utilization!).toBeCloseTo(c.demand!/c.resistance!,12);
      expect(c.clauses!.length).toBeGreaterThan(0);
      if(c.id==="shear_z")expect(c.resistance!).toBeCloseTo(vrd,6);
      if(c.id==="my")expect(c.resistance!).toBeLessThanOrEqual(Math.min(zx*345e6/1.10,1.5*wx*345e6/1.10)+1e-6);
    }
    // Cb recomputed independently from the fitted moment field at the quarter points of the whole piece
    const my=row.executedChecks.find(c=>c.id==="my");
    if(my){
      const segs=fits.get(row.pieceId+"/"+row.combinationId)!,piece=demands.pieces.find(p=>p.pieceId===row.pieceId)!;
      const at=(pos:number)=>{
        const i=piece.segments.findIndex((s,k)=>pos<=(s.t0+(s.lengthMm/1000)/piece.lengthM)*piece.lengthM+1e-9||k===piece.segments.length-1);
        const seg=piece.segments[i],f=segs[i].myNm!,u=(pos-seg.t0*piece.lengthM)/(seg.lengthMm/1000);
        return Math.abs(f[0]+(f[1]??0)*u+(f[2]??0)*u*u);
      };
      const L=piece.lengthM,mmax=Math.max(...[...Array(401).keys()].map(k=>at(L*k/400))),[ma,mb,mc]=[.25,.5,.75].map(q=>at(q*L));
      expect((my as unknown as {cb:{cb:number}}).cb.cb).toBeCloseTo(12.5*mmax/(2.5*mmax+3*ma+4*mb+3*mc),6);
    }
  }
  // principal SC governs over permanents only (larger utilization in the SC combination)
  const p2=matrix.rows.filter(r=>r.pieceId==="P2");
  expect(p2[1].maxUtilization!).toBeGreaterThan(p2[0].maxUtilization!);
},240000);
