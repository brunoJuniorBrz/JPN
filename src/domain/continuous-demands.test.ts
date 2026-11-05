import { expect,it } from "vitest";
import { extractContinuousDemands,polynomial,polynomialRoots01 } from "./continuous-demands";
import { fixture } from "./test-support/continuous-fixture";

it("isola raízes repetidas, limites, escalas e polinômio nulo sem falsos extremos",()=>{
  expect(polynomialRoots01([0,0,0])).toEqual([]);expect(polynomialRoots01([.25,-1,1])).toEqual([.5]);
  for(const scale of [1e-20,1,1e20]){const roots=polynomialRoots01([-.08,.66,-1.5,1].map(x=>x*scale));expect(roots).toHaveLength(3);roots.forEach((r,i)=>expect(r).toBeCloseTo([.2,.5,.8][i],12));}
});
it.each([false,true])("viga propped: máximo entre amostras e flecha quartica independente; segmentada=%s",async segmented=>{
  const f=await fixture("propped",segmented),r=await extractContinuousDemands(f.prepared,f.result,f.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!,rows=p.fields.flatMap(f=>f.rows).filter(r=>r.combinationId==="POS");
  expect(rows.some(r=>Math.abs(r.originalPositionM-2.5)<1e-10)).toBe(true);
  const xDef=(15-Math.sqrt(33))*4/16;expect(rows.some(r=>Math.abs(r.originalPositionM-xDef)<1e-10)).toBe(true);
  for(const row of rows){const x=row.originalPositionM;expect(row.forces.nN).toBeCloseTo(1234+40*(4-x),6);expect(row.forces.tNm).toBeCloseTo(20,6);expect(row.forces.mzNm!).toBeCloseTo(-100*(x*x/2-5*4*x/8+4*4/8),6);expect(row.forces.myNm!).toBeCloseTo(70*(x*x/2-5*4*x/8+4*4/8),6);expect(row.translationLocalM![1]).toBeCloseTo(-100*(x**4/24-5*4*x**3/48+4**2*x*x/16)/(200e9*1e-5),11);}
  if(segmented){const cut=rows.filter(r=>Math.abs(r.originalPositionM-1.3)<1e-12);expect(cut).toHaveLength(2);expect(new Set(cut.map(r=>r.segmentId)).size).toBe(2);}
  expect(r.interactionStatus).toBe("unsupported");expect(r.approvedForFabrication).toBe(false);
},20000);
it.each(["simple","cantilever"])("referência %s, seção girada e cargas globais/locais, sinais e concomitância",async mode=>{
  const [a,b]=await Promise.all([fixture(mode,false,37,false),fixture(mode,false,37,true)]),r=await extractContinuousDemands(a.prepared,a.result,a.trace),s=await extractContinuousDemands(b.prepared,b.result,b.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!;
  for(const field of p.fields){const factor=field.combinationId==="POS"?1:-2;for(const row of field.rows){const x=row.segmentPositionM;const expected=mode==="simple"?100*x*(4-x)/2:-100*(4-x)**2/2;expect(row.forces.mzNm!).toBeCloseTo(factor*expected,6);expect(row.forces.myNm!).toBeCloseTo(-.7*factor*expected,6);expect(row.forces.nN).toBeCloseTo(factor*(1234+40*(4-x)),6);}
    const other=s.pieces.find(p=>p.pieceId==="BEAM")!.fields.find(f=>f.combinationId===field.combinationId)!;for(const k of ["nN","vyN","vzN","tNm","myNm","mzNm"] as const)for(const u of [.13,.49,.81])expect(polynomial(field.forcePolynomials[k]!,u)).toBeCloseTo(polynomial(other.forcePolynomials[k]!,u),7);
  }
  if(mode==="simple"){const field=p.fields[0];expect(polynomial(field.displacementPolynomials![1],.5)).toBeCloseTo(-5*100*4**4/(384*200e9*1e-5),11);}
},20000);
it("legacy v1 mantém esforços contínuos nodais e deslocamentos unsupported; corrupção bloqueada",async()=>{
  const f=await fixture("cantilever",false,0,false,1),r=await extractContinuousDemands(f.prepared,f.result,f.trace);expect(r.pieces[0].fields[0].displacementStatus).toBe("unsupported");
  const bad=structuredClone(f.trace);bad.members.F.global_to_local[1][0]=.1;await expect(extractContinuousDemands(f.prepared,f.result,bad)).rejects.toThrow();
  const v=await fixture();v.result.combinations.POS.members.F.stations[1].mz_nm+=10;await expect(extractContinuousDemands(v.prepared,v.result,v.trace)).rejects.toThrow(/CONTINUOUS_FIELD_MISMATCH/);
},20000);
it("balanço espacial inclinado, seção girada 37° e vetor concomitante em posições não amostradas",async()=>{
  const f=await fixture("cantilever",false,37,false,2,true),r=await extractContinuousDemands(f.prepared,f.result,f.trace),p=r.pieces.find(p=>p.pieceId==="BEAM")!;
  for(const field of p.fields){const factor=field.combinationId==="POS"?1:-2;for(const x of [.37,1.41,3.19]){const u=x/4;expect(polynomial(field.forcePolynomials.nN!,u)).toBeCloseTo((1234+40*(4-x))*factor,6);expect(polynomial(field.forcePolynomials.tNm!,u)).toBeCloseTo(20*factor,6);expect(polynomial(field.forcePolynomials.mzNm!,u)).toBeCloseTo(-100*factor*(4-x)**2/2,6);expect(polynomial(field.forcePolynomials.myNm!,u)).toBeCloseTo(70*factor*(4-x)**2/2,6);expect(polynomial(field.displacementPolynomials![1],u)).toBeCloseTo(-100*factor*x*x*(6*16-16*x+x*x)/(24*200e9*1e-5),11);}}
},20000);

it("liberações flexionais nativas preservam a curva contínua e momentos liberados nulos",async()=>{
  const f=await fixture("released"),r=await extractContinuousDemands(f.prepared,f.result,f.trace),field=r.pieces.find(p=>p.pieceId==="BEAM")!.fields[0];
  expect(polynomial(field.forcePolynomials.mzNm!,1)).toBeCloseTo(0,7);expect(polynomial(field.forcePolynomials.myNm!,1)).toBeCloseTo(0,7);
  expect(polynomial(field.forcePolynomials.mzNm!,2.5/4)).toBeCloseTo(112.5,6);
  const x=(15-Math.sqrt(33))*4/16;expect(polynomial(field.displacementPolynomials![1],x/4)).toBeCloseTo(-100*(x**4/24-5*4*x**3/48+16*x*x/16)/(200e9*1e-5),11);
},20000);
