import { z } from "zod";

const n=z.number().finite().min(-10000).max(10000);
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
const source=z.string().min(1).max(1000).refine(s=>!!s.trim());
export const roofGeometryToleranceM=1e-7;
const rect=z.tuple([n,n,n,n]).refine(([x0,y0,x1,y1])=>x1-x0>roofGeometryToleranceM&&y1-y0>roofGeometryToleranceM,"Retângulo degenerado.");
export const roofDistributionSchema=z.object({version:z.literal(1),method:z.literal("parallel-purlin-strips"),geometrySignature:z.string().min(1).max(100000)}).strict();
const region=z.object({id,boundsM:rect,
  // z = z0 + dz/dx * (x-x0) + dz/dy * (y-y0), SI, never a guessed elevation.
  plane:z.object({z0M:n,dzDx:n,dzDy:n}).strict(),
  purlinPieceIds:z.array(id).max(600),source,revision:source,
}).strict();
export type RoofRegion=z.infer<typeof region>;
const area=([x0,y0,x1,y1]:number[])=>(x1-x0)*(y1-y0);
const overlap=(a:number[],b:number[])=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
export function regionElevation(r:RoofRegion,x:number,y:number){return r.plane.z0M+r.plane.dzDx*(x-r.boundsM[0])+r.plane.dzDy*(y-r.boundsM[1]);}
export function regionVertices(r:RoofRegion){const [a,b,c,d]=r.boundsM;return [[a,b],[c,b],[c,d],[a,d]].map(([x,y])=>[x,y,regionElevation(r,x,y)] as [number,number,number]);}
/** Rectangular planar regions only. The declared footprint can be an L union;
 * its voids are not silently filled with the bounding rectangle. */
export const roofRegionsSchema=z.object({schema_version:z.literal("jpn.roof-regions/1"),units:z.literal("m"),
  footprintM:z.array(rect).min(1).max(20),regions:z.array(region).min(1).max(20),
}).strict().superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(new Set(v.regions.map(r=>r.id)).size!==v.regions.length)issue("DUPLICATE_REGION: identificadores repetidos.");
  for(const r of v.regions)if(new Set(r.purlinPieceIds).size!==r.purlinPieceIds.length)issue("DUPLICATE_ASSOCIATION: peça repetida na região.");
  for(const list of [v.footprintM,v.regions.map(r=>r.boundsM)])for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(overlap(list[i],list[j])>0)issue("ROOF_OVERLAP: superfícies/contornos sobrepostos.");
  const sum=v.regions.reduce((s,r)=>s+area(r.boundsM),0),expected=v.footprintM.reduce((s,r)=>s+area(r),0);
  const covered=v.regions.reduce((s,r)=>s+v.footprintM.reduce((t,b)=>t+overlap(r.boundsM,b),0),0);
  if(Math.abs(sum-expected)>1e-10*Math.max(1,expected)||Math.abs(covered-expected)>1e-10*Math.max(1,expected))issue("ROOF_GAP: regiões não cobrem exatamente o contorno declarado ou saem dele.");
  for(let i=0;i<v.regions.length;i++)for(let j=i+1;j<v.regions.length;j++){
    const a=v.regions[i],b=v.regions[j],x0=Math.max(a.boundsM[0],b.boundsM[0]),x1=Math.min(a.boundsM[2],b.boundsM[2]),y0=Math.max(a.boundsM[1],b.boundsM[1]),y1=Math.min(a.boundsM[3],b.boundsM[3]);
    if(x1<x0||y1<y0)continue;
    for(const [x,y]of [[x0,y0],[x1,y1]])if(Math.abs(regionElevation(a,x,y)-regionElevation(b,x,y))>roofGeometryToleranceM)issue("ROOF_SEAM: elevações incompatíveis no encontro; nenhum plano foi ajustado.");
  }
});
export type RoofRegions=z.infer<typeof roofRegionsSchema>;
