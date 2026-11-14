import {afterEach,expect,it,vi} from "vitest";
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {roofProject} from "./test-support/m42-roof-fixture";
import {applyNbr6120Actions} from "./nbr6120-actions";
import {generateNbr8681Combinations,applyNbr8681Combinations} from "./nbr8681-combinations";
import {adaptLoadedMixedProject} from "./loaded-mixed-adapter";
import {selfWeightOverlapReviewBasis} from "./structural-loading";
import {buildResistanceReport} from "./resistance-report";
import {buildMemberCombinationMatrix,fitSegmentForceField,requiredChecks} from "./member-combination-matrix";
import type {DesignExecution} from "./member-combination-matrix";
import {runLocalMixed} from "@/infrastructure/analysis/local-mixed-runner";
import {checkProcedures} from "./resistance-assessment";
import {availableNormativeProcedures} from "./normative-procedures";
afterEach(()=>vi.unstubAllEnvs());

const F=(o:Partial<Record<"nN"|"vyN"|"vzN"|"tNm"|"myNm"|"mzNm",number|null>>)=>({nN:0,vyN:0,vzN:0,tNm:0,myNm:0,mzNm:0,...o}) as
  {nN:number;vyN:number|null;vzN:number|null;tNm:number|null;myNm:number|null;mzNm:number|null};

it("campo de esforços: parábola e reta exatas a partir das estações; cúbica, parcial e contagem inválida são recusadas",()=>{
  const st=(f:(u:number)=>Partial<Record<"nN"|"vzN"|"myNm",number>>,n=5)=>[...Array(n).keys()].map(i=>({u:i/(n-1),forces:F(f(i/(n-1)))}));
  const x=fitSegmentForceField(st(u=>({nN:-500,vzN:4000*(1-2*u),myNm:8000*u*(1-u)})));
  expect(x.myNm).toEqual([0,8000,-8000]);
  expect(x.vzN!.map(v=>+v.toFixed(9))).toEqual([4000,-8000,0]);
  expect(x.nN).toEqual([-500,0,0]);
  expect(fitSegmentForceField(st(u=>({nN:100+50*u}),2)).nN).toEqual([100,50]);       // axial: 2 stations, linear
  expect(()=>fitSegmentForceField(st(u=>({myNm:1000*u**3})))).toThrow("DEMAND_FIELD_NOT_QUADRATIC");
  expect(()=>fitSegmentForceField(st(u=>({myNm:u}),3))).toThrow("DEMAND_FIELD_STATIONS");
  const partial=st(u=>({myNm:u}));partial[2].forces.myNm=null;
  expect(()=>fitSegmentForceField(partial)).toThrow("DEMAND_FIELD_INCOMPLETE");
});
it("verificações exigidas pela demanda: sinais, interações e componentes sem procedimento",()=>{
  expect(requiredChecks([F({nN:-5,myNm:3})]).sort()).toEqual(["combined-9.9","compression","compression-slenderness","my_positive"]);
  expect(requiredChecks([F({nN:5,myNm:-3,vzN:2})]).sort()).toEqual(["bending-shear-9.8.4","combined-9.9","my_negative","shear_z","tension"]);
  expect(requiredChecks([F({myNm:3}),F({myNm:-3})]).sort()).toEqual(["my_negative","my_positive"]);
  expect(requiredChecks([F({nN:-1e-12,myNm:3e-12}),F({nN:1000})])).toEqual(["tension"]);      // round-off is not demand
  expect(requiredChecks([F({tNm:1,vyN:2})]).sort()).toEqual(["unsupported-tNm","unsupported-vyN"]);
});
it("registro normativo contém 9.6.3 e 9.8.4 e a tabela de procedimentos os mapeia",()=>{
  expect(checkProcedures["bending-shear-9.8.4"]).toBe("NBR14762:2010-9.8.4");
  expect(checkProcedures["tension-slenderness"]).toBe("NBR14762:2010-9.6.3");
  expect(availableNormativeProcedures).toContain("NBR14762:2010-9.8.4");
  expect(availableNormativeProcedures).toContain("NBR14762:2010-9.6.3");
});

const decl=(families:string[])=>({schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",permanentSets:["unfavorable"],families,
  actions:[{nature:"permanent",caseId:"G",permanentType:"steel-and-equipment"},
    {nature:"variable",caseId:"Q",variableType:"other-and-equipment-temperature",psiRow:"libraries-archives-warehouses-workshops-garages-roofs",exclusiveGroup:null}]});
it("matriz peça x combinação ELU: unsupported sem execução, bloqueio, ausência, FAIL e CONDITIONAL",()=>{
  const g=generateNbr8681Combinations(decl(["uls-normal","sls-rare"]),["G","Q"]);
  const uls=g.trace.filter(c=>c.purpose==="ULS").map(c=>c.id),sls=g.trace.filter(c=>c.purpose!=="ULS").map(c=>c.id);
  const sample=(combinationId:string,forces:ReturnType<typeof F>)=>({pieceId:"B",combinationId,segmentId:"S",originalPositionM:0,forces});
  const demands={pieces:[{pieceId:"B",samples:uls.flatMap(c=>[sample(c,F({nN:-1000,myNm:500})),{...sample(c,F({nN:-1000,myNm:-200})),originalPositionM:1}])}]};
  const ok=(id:string,u=.5):DesignExecution["checks"][number]=>({id,status:"CONDITIONAL",demand:1,resistance:2,utilization:u,clauses:["x"]});
  const full=["compression","compression-slenderness","my_positive","my_negative","combined-9.9"].map(k=>ok(k));
  const run=(executions:DesignExecution[])=>buildMemberCombinationMatrix({engineeringCombinations:g.engineeringCombinations,demands,executions});
  let m=run([]);
  expect(m.rows).toHaveLength(uls.length);                         // ELS combinations are not strength rows
  expect(sls.length).toBeGreaterThan(0);
  expect(m.rows.every(r=>r.status==="unsupported"&&r.reason!.includes("nenhuma verificação"))).toBe(true);
  expect(m.status).toBe("unsupported");
  m=run([{pieceId:"B",combinationId:uls[0],checks:full}]);
  expect(m.rows[0].status).toBe("CONDITIONAL");
  expect(m.rows[0].maxUtilization).toBe(.5);
  expect(m.rows[0].demand!.myNm).toMatchObject({absoluteMax:500,minimum:-200,maximum:500,positionM:0});
  expect(m.rows[0].combination!.reference.standard).toBe("ABNT NBR 8681");
  expect(m.rows[0].combination!.factors.map(f=>f.caseId)).toEqual(["G","Q"]);
  expect(m.rows[1].status).toBe("unsupported");                    // other combinations still not executed
  m=run([{pieceId:"B",combinationId:uls[0],checks:full.filter(c=>c.id!=="my_negative")}]);
  expect(m.rows[0].status).toBe("unsupported");expect(m.rows[0].missingChecks).toEqual(["my_negative"]);
  m=run([{pieceId:"B",combinationId:uls[0],checks:[...full.filter(c=>c.id!=="combined-9.9"),{id:"combined-9.9",status:"BLOCKED",reason:"N variável",utilization:null}]}]);
  expect(m.rows[0].status).toBe("unsupported");expect(m.rows[0].reason).toContain("combined-9.9");
  m=run([{pieceId:"B",combinationId:uls[0],checks:[...full.slice(0,4),{id:"combined-9.9",status:"FAIL",demand:3,resistance:1,utilization:3}]}]);
  expect(m.rows[0].status).toBe("FAIL");expect(m.rows[0].maxUtilization).toBe(3);
  expect(()=>run([{pieceId:"B",combinationId:"NOPE",checks:[]}])).toThrow("EXECUTION_UNKNOWN_COMBINATION");
  expect(()=>run([{pieceId:"Z",combinationId:uls[0],checks:[]}])).toThrow("EXECUTION_UNKNOWN_PIECE");
  expect(()=>run([{pieceId:"B",combinationId:uls[0],checks:[]},{pieceId:"B",combinationId:uls[0],checks:[]}])).toThrow("EXECUTION_DUPLICATE");
  expect(()=>buildMemberCombinationMatrix({engineeringCombinations:null,demands,executions:[]})).toThrow("COMBINATIONS_PENDING");
  expect(m.computedStructuralApproval).toBe(false);expect(m.fabricationRelease).toBe(false);
  expect(m.releaseGate).toBe("NOT_READY_BLOCKED");expect(m.memberAllLimitStatesVerified).toBe(false);
});

// ---------------- real chain: NBR 6120 -> NBR 8681 -> PyNite -> demands -> NBR 14762 (Python) -> matrix ------------------
const pythonExecutable=()=>{
  const portable=path.resolve(".tools/python/python.exe");
  return process.env.JPN_PYTHON_EXECUTABLE||(existsSync(portable)?portable:path.resolve(process.platform==="win32"?".venv/Scripts/python.exe":".venv/bin/python"));
};
const DESIGN_SCRIPT="import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom jpn_structural.coldformed_design import analyze_coldformed_design\nprint(json.dumps(analyze_coldformed_design(json.load(sys.stdin))))";
const designPython=(request:unknown)=>JSON.parse(execFileSync(pythonExecutable(),["-I","-X","utf8","-c",DESIGN_SCRIPT,path.resolve("engine")],
  {input:JSON.stringify(request),encoding:"utf8",windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:"1",OMP_NUM_THREADS:"1"}}));
const triplet={global:1e12,local:1e12,distortional:1e12};
// Explicit synthetic section (test input, not a commercial profile): W*fy and A*fy become the yield limits.
const SECTION={family:"cold-formed",shape:"u-stiffened",area_m2:.001,fy_pa:250e6,fu_pa:400e6,e_pa:200e9,iy_m4:1e-5,iz_m4:2e-6,wy_m3:1e-4,wz_m3:5e-5,
  source:"Seção sintética explícita do ensaio M44-P1, não comercial",revision:"1"};

it("NBR 6120 + NBR 8681 + PyNite + NBR 14762: relatório por peça e combinação ELU com demanda, resistência, utilização e cláusula",async()=>{
  vi.stubEnv("NODE_ENV","development");
  vi.stubEnv("JPN_LOCAL_MIXED_ENABLED","1");
  vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN","http://127.0.0.1:3000");
  const r6=applyNbr6120Actions(roofProject(),{schema_version:"jpn.nbr6120-roof-actions/1",
    permanent:[{kind:"roof-cladding",caseId:"TELHA",item:"steel-0.5mm",permanentType8681:"steel-and-equipment"}],roofLiveLoad:{caseId:"SC"}});
  const {project,generated}=applyNbr8681Combinations(r6.project,{schema_version:"jpn.nbr8681-declaration/1",permanentMode:"separate",variableMode:"separate",
    permanentSets:["unfavorable"],families:["uls-normal"],actions:[{nature:"permanent",caseId:"ZERO",permanentType:"steel-and-equipment"},...r6.nbr8681Actions]});
  const uls=generated.trace.map(c=>c.id);
  expect(uls).toHaveLength(2);                                      // permanents only + principal SC
  const sp=project.workspace.spatialPreparation!;
  sp.loading!.overlapReview={confirmed:true,source:"Confirmação sintética do ensaio M44-P1: ações independentes",revision:"M44-P1 v1",
    basis:selfWeightOverlapReviewBasis(sp,sp.loading!)};
  const prepared=await adaptLoadedMixedProject(project);
  const solved=await runLocalMixed(JSON.stringify(prepared.request));
  if(solved.status!=="completed")throw Error("PyNite não analisou");
  const report=await buildResistanceReport(project,prepared,solved.result);
  const demands=report.demands;
  expect(demands.pieces.map(p=>p.pieceId).sort()).toEqual(["P1","P2","P3","TC1","TC2"]);
  // --- NBR 14762 design request per piece/combination from the REAL solver stations
  const executions:DesignExecution[]=[],fits:Record<string,ReturnType<typeof fitSegmentForceField>>={};
  for(const piece of demands.pieces)for(const cid of uls){
    const fields=piece.segments.map(seg=>{
      const rows=piece.samples.filter(s=>s.segmentId===seg.id&&s.combinationId===cid).sort((a,b)=>a.stationIndex-b.stationIndex);
      const forces=fitSegmentForceField(rows.map((r,i)=>({u:i/(rows.length-1),forces:r.forces})));
      fits[piece.pieceId+"/"+cid+"/"+seg.id]=forces;
      return {segment_id:seg.id,offset_m:seg.t0*piece.lengthM,length_m:seg.lengthMm/1000,forces};
    });
    const result=designPython({schema_version:"jpn.coldformed-design/1",units:"SI",piece_id:piece.pieceId,combination_id:cid,
      binding:{mechanical_sha256:"a".repeat(64),analysis_input_sha256:demands.binding.inputSha256,analysis_result_sha256:demands.binding.resultSha256},
      section:{...SECTION,effective_length_y_m:piece.lengthM,effective_length_z_m:piece.lengthM},
      study:{source:"Controle crítico declarado do ensaio",revision:"1",responsible:"Ensaio sintético",basis_sha256:"a".repeat(64),
        boundary_and_load_pattern:"Limites de escoamento: modos críticos elevados declarados no ensaio",minimum_search:"reviewed-elastic-mode-minima"},
      critical:{compression:triplet,my_positive:triplet,my_negative:triplet,mz_positive:triplet,mz_negative:triplet},
      tension:{basis:"declared-net-areas",net_outside_m2:.001,net_connection_m2:.001,ct:1,source:"Seção cheia declarada no ensaio",revision:"1"},
      web:{flat_height_m:.1,thickness_m:.002,unstiffened_single_web:true},fields});
    expect(result.computed_structural_approval).toBe(false);
    executions.push({pieceId:piece.pieceId,combinationId:cid,checks:result.checks});
  }
  const matrix=buildMemberCombinationMatrix({engineeringCombinations:sp.engineeringCombinations!,demands,executions});
  expect(matrix.rows).toHaveLength(5*uls.length);
  expect(matrix.releaseGate).toBe("NOT_READY_BLOCKED");
  let executed=0;
  for(const row of matrix.rows){
    expect(row.combination!.reference.standard).toBe("ABNT NBR 8681");                 // traceable combination origin
    if(row.status==="no-demand"){expect(row.requiredChecks).toEqual([]);expect(["TC1","TC2"]).toContain(row.pieceId);continue;}   // zero-force chords
    if(row.executedChecks.some(c=>c.status==="BLOCKED"))expect(row.status).toBe("unsupported");   // never silently PASS
    else if(!row.missingChecks.length){
      executed++;expect(["CONDITIONAL","FAIL"]).toContain(row.status);
    }
    for(const c of row.executedChecks)if(c.status!=="BLOCKED"){
      // utilization = demand/resistance and clause present
      expect(c.utilization!).toBeCloseTo(c.demand!/c.resistance!,12);
      expect(c.clauses!.length).toBeGreaterThan(0);
    }
    // independent resistances for the declared section (huge critical loads => yield limits)
    for(const c of row.executedChecks){
      if(c.id==="my_positive"||c.id==="my_negative")expect(c.resistance!).toBeCloseTo(1e-4*250e6/1.1,6);
      if(c.id==="compression")expect(c.resistance!/(.001*250e6/1.2)).toBeCloseTo(1,5);
      if(c.id==="tension")expect(c.resistance!).toBeCloseTo(.001*250e6/1.1,6);
      if(c.id==="shear_z")expect(c.resistance!).toBeCloseTo(.6*250e6*.1*.002/1.1,6);
    }
    // the design bending demand is the true extremum of the fitted field (vertex included), not just a station
    const my=row.executedChecks.find(c=>c.id==="my_positive");
    if(my&&my.demand!==undefined){
      const piece=demands.pieces.find(p=>p.pieceId===row.pieceId)!;
      const cands:number[]=[];
      for(const seg of piece.segments){
        const f=fits[row.pieceId+"/"+row.combinationId+"/"+seg.id].myNm;
        if(!f)continue;
        const [c0,c1,c2]=[f[0],f[1],f[2]??0],at=(u:number)=>c0+c1*u+c2*u*u;
        cands.push(at(0),at(1));
        if(c2!==0){const v=-c1/(2*c2);if(v>0&&v<1)cands.push(at(v));}
      }
      expect(my.demand).toBeCloseTo(Math.max(...cands),6);
    }
  }
  expect(executed).toBe(6);                       // P1, P2, P3 x two ELU combinations
  expect(matrix.noDemandRows).toBe(4);            // TC1, TC2 carry no force in this model
  expect(matrix.unsupportedRows).toBe(0);
  expect(matrix.status).toBe("CONDITIONAL");
  const p2=matrix.rows.filter(r=>r.pieceId==="P2");
  expect(p2.map(r=>r.executedChecks.some(c=>c.id==="bending-shear-9.8.4"))).toEqual([true,true]);   // newly unblocked 9.8.4
  expect(p2[1].maxUtilization!).toBeGreaterThan(p2[0].maxUtilization!);                              // principal SC governs
},240000);
