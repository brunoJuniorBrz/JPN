import { expect,it } from "vitest";
import { fixture } from "./test-support/continuous-fixture";
import { extractContinuousDemands,polynomialRoots01 } from "./continuous-demands";
import { extractWholePieceDeflections } from "./whole-piece-deflection";
import { evaluateDeclaredService,type DeclaredServiceCriterion } from "./declared-service";
import { mixedInputHash } from "./mixed-analysis";

it("peça segmentada: corda original difere da corda de cada segmento; vetor global crítico independente",async()=>{
  const f=await fixture("propped",true,37,false),c=await extractContinuousDemands(f.prepared,f.result,f.trace),whole=await extractWholePieceDeflections(c),beam=whole.pieces.find(p=>p.pieceId==="BEAM")!;
  expect(beam.status).toBe("continuous-verified");const pos=beam.combinations.find(c=>c.combinationId==="POS")!,critical=pos.rows.find(r=>r.id===pos.maximumNorm)!;
  const x=(15-Math.sqrt(33))*4/16,shape=(x**4/24-20*x**3/48+16*x*x/16),expected=Math.hypot(-100*shape/(200e9*1e-5),-70*shape/(200e9*2e-5));
  // Axial chord-relative displacement from qx=40 contributes independently.
  const axial=40*x*(4-x)/(2*200e9*.01);expect(critical.originalPositionM).toBeCloseTo(x,5);expect(critical.normM).toBeCloseTo(Math.hypot(expected,axial),10);
  expect(pos.rows.filter(r=>Math.abs(r.originalPositionM-1.3)<1e-12)).toHaveLength(2);
  const criterion:DeclaredServiceCriterion={schema_version:"jpn.declared-service-criterion/1",id:"ELS",pieceId:"BEAM",combinations:["POS"],quantity:"vector-norm",reference:"original-piece-end-chord",limitM:.001,source:"Independent synthetic declared limit, NOT ABNT",revision:"1",responsible:"Synthetic test"};
  const pass=evaluateDeclaredService([{...criterion,limitM:.01}],whole,["POS"])[0],fail=evaluateDeclaredService([{...criterion,limitM:1e-6}],whole,["POS"])[0];
  expect(pass.status).toBe("meets-declared-limit");expect(fail.status).toBe("exceeds-declared-limit");expect(pass.normativeVerified).toBe(false);expect(fail.calculation!.governing.forces.nN).toBeCloseTo(1234+40*(4-fail.calculation!.governing.originalPositionM),6);
  expect(evaluateDeclaredService([criterion],whole,[])[0].status).toBe("blocked");
},20000);
it("raízes de grau sete, translação rígida e invariância da flecha vetorial em barra inclinada",async()=>{
  // Seven independent roots, including a very close pair, without a sampling grid.
  const roots=[.08,.21,.4,.4001,.63,.79,.94];let polynomial=[1];for(const r of roots){const p=Array(polynomial.length+1).fill(0);polynomial.forEach((x,i)=>{p[i]-=x*r;p[i+1]+=x;});polynomial=p;}
  const found=polynomialRoots01(polynomial);expect(found).toHaveLength(7);found.forEach((r,i)=>expect(r).toBeCloseTo(roots[i],7));
  const f=await fixture("cantilever",true,37,false,2,true),c=await extractContinuousDemands(f.prepared,f.result,f.trace),a=await extractWholePieceDeflections(c);
  const altered=structuredClone(c);for(const p of altered.pieces)for(const field of p.fields)if(field.displacementPolynomials)for(let j=0;j<3;j++)field.displacementPolynomials[j][0]+=field.globalToLocal[j][0]*.125;
  const {reportSha256,...body}=altered;void reportSha256;altered.reportSha256=await mixedInputHash(body);const b=await extractWholePieceDeflections(altered);
  expect(a.pieces[0].combinations[0].rows.find(r=>r.id===a.pieces[0].combinations[0].maximumNorm)!.normM).toBeCloseTo(b.pieces[0].combinations[0].rows.find(r=>r.id===b.pieces[0].combinations[0].maximumNorm)!.normM,12);
  await expect(extractWholePieceDeflections({...c,reportSha256:"0".repeat(64)})).rejects.toThrow(/STALE/);
},20000);
