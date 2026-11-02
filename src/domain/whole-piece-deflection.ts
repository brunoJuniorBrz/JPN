import { polynomial,polynomialRoots01,type ContinuousDemands } from "./continuous-demands";
import { toGlobal,type V3 } from "./member-end-actions";
import { mixedInputHash } from "./mixed-analysis";
import { demandComponents,type DemandForces } from "./member-demands";
const derivative=(c:number[])=>c.slice(1).map((v,i)=>v*(i+1));
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));

/** First-order displacement from the ORIGINAL piece endpoint chord in GLOBAL
 * XYZ. All segment faces retained. No service limit, ABNT rule or interaction
 * resistance follows from these kinematic extrema. */
export async function extractWholePieceDeflections(continuous:ContinuousDemands){
  const {reportSha256,...body}=continuous;if(await mixedInputHash(body)!==reportSha256)throw Error("STALE_CONTINUOUS_REPORT");
  const pieces=continuous.pieces.map(piece=>{
    if(piece.kind!=="frame"||piece.fields.some(f=>!f.displacementPolynomials))return {pieceId:piece.pieceId,status:"unsupported" as const,reason:"Translações contínuas de todos os segmentos necessárias; modelo axial/v1 não fornece esse campo.",combinations:[]};
    const combinations=[...new Set(piece.fields.map(f=>f.combinationId))].map(combinationId=>{
      const fields=piece.fields.filter(f=>f.combinationId===combinationId).sort((a,b)=>a.rows[0].originalPositionM-b.rows[0].originalPositionM),first=fields[0],last=fields.at(-1)!;
      const lengthM=fields.reduce((s,f)=>s+f.lengthM,0),start=toGlobal(first.globalToLocal,first.displacementPolynomials!.map(c=>polynomial(c,0)) as V3),end=toGlobal(last.globalToLocal,last.displacementPolynomials!.map(c=>polynomial(c,1)) as V3);
      let cursor=0;
      for(const f of fields){if(!near(f.rows[0].originalPositionM,cursor)||f.globalToLocal[0].some((v,i)=>!near(v,first.globalToLocal[0][i])))throw Error("WHOLE_PIECE_NOT_STRAIGHT_CONTIGUOUS");cursor+=f.lengthM;}
      const rows=fields.flatMap(f=>{
        const offset=f.rows[0].originalPositionM,local=f.displacementPolynomials!,global=[0,1,2].map(i=>[0,1,2,3,4].map(k=>[0,1,2].reduce((sum,j)=>sum+f.globalToLocal[j][i]*(local[j][k]??0),0)));
        const relative=global.map((c,i)=>{const p=[...c],delta=end[i]-start[i];p[0]-=start[i]+delta*offset/lengthM;p[1]-=delta*f.lengthM/lengthM;return p;});
        const normDerivative=Array(8).fill(0);for(const c of relative)c.forEach((a,i)=>derivative(c).forEach((b,j)=>normDerivative[i+j]+=2*a*b));
        const locations=new Set([0,1,...relative.flatMap(c=>polynomialRoots01(derivative(c))),...polynomialRoots01(normDerivative)]);
        return [...locations].sort((a,b)=>a-b).map(u=>{const displacement=relative.map(c=>polynomial(c,u)) as V3;return {id:JSON.stringify([piece.pieceId,f.segmentId,combinationId,u,"whole-chord"]),segmentId:f.segmentId,combinationId,segmentPositionM:u*f.lengthM,originalPositionM:offset+u*f.lengthM,side:u===0?"start":u===1?"end":"interior",relativeGlobalM:displacement,normM:Math.hypot(...displacement),forces:Object.fromEntries(demandComponents.map(k=>[k,f.forcePolynomials[k]?polynomial(f.forcePolynomials[k]!,u):null])) as DemandForces};});
      });
      const absoluteByGlobalAxis=[0,1,2].map(i=>rows.reduce((a,b)=>Math.abs(b.relativeGlobalM[i])>Math.abs(a.relativeGlobalM[i])?b:a).id),maximumNorm=rows.reduce((a,b)=>b.normM>a.normM?b:a);
      return {combinationId,lengthM,reference:{kind:"original-piece-end-chord",startGlobalM:start,endGlobalM:end},rows,absoluteByGlobalAxis,maximumNorm:maximumNorm.id};
    });
    return {pieceId:piece.pieceId,status:"continuous-verified" as const,reason:null,combinations};
  });
  const report={schema_version:"jpn.whole-piece-deflection/1",binding:continuous.binding,continuousReportSha256:continuous.reportSha256,units:"SI",pieces,method:"Global original-end chord; component derivatives and degree-7 derivative of squared vector norm; interval root isolation",normativeServiceVerified:false,approvedForFabrication:false};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export type WholePieceDeflections=Awaited<ReturnType<typeof extractWholePieceDeflections>>;
