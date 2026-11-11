import { z } from "zod";
const coordinate=z.number().finite().min(-10000000).max(10000000),point=z.tuple([coordinate,coordinate]);
type Point=[number,number];const epsilon=1e-6;
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const sign=(a:Point,b:Point,c:Point)=>{const v=cross(a,b,c),tol=epsilon*Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]));return Math.abs(v)<=tol?0:Math.sign(v);};
const on=(a:Point,b:Point,p:Point)=>sign(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])-epsilon&&p[0]<=Math.max(a[0],b[0])+epsilon&&p[1]>=Math.min(a[1],b[1])-epsilon&&p[1]<=Math.max(a[1],b[1])+epsilon;
function intersects(a:Point,b:Point,c:Point,d:Point){return sign(a,b,c)*sign(a,b,d)<0&&sign(c,d,a)*sign(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
export const signedRingAreaMm2=(ring:readonly Point[])=>ring.slice(1).reduce((s,p,i)=>s+ring[i][0]*p[1]-p[0]*ring[i][1],0)/2;
function inside(p:Point,ring:Point[]){let yes=false;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(on(a,b,p))return false;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const source=z.string().trim().min(1).max(1000);
/** Independent horizontal XY projection, never inferred from members or bounds.
 * Outer CCW, holes CW, explicitly closed; ambiguous contacts are refused. */
export const roofOutlineSchema=z.object({schema_version:z.literal("jpn.roof-outline/1"),units:z.literal("mm"),projection:z.literal("horizontal-XY"),source,revision:source,
  outer:z.array(point).min(4).max(101),holes:z.array(z.array(point).min(4).max(101)).max(10),supportPieceIds:z.array(z.string().min(1).max(60)).max(600),
}).strict().superRefine((v,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});const rings=[v.outer,...v.holes];
  if(rings.some(r=>r.length<4)){issue("OUTLINE_INCOMPLETE: complete e feche todos os polígonos antes de calcular a área.");return;}
  if(new Set(v.supportPieceIds).size!==v.supportPieceIds.length)issue("OUTLINE_DUPLICATE_SUPPORT");
  for(const [r,ring] of rings.entries()){
    const a=ring[0],b=ring[ring.length-1];if(a[0]!==b[0]||a[1]!==b[1])issue("OUTLINE_NOT_CLOSED: feche explicitamente cada polígono.");
    const area=signedRingAreaMm2(ring);if(r===0?area<=epsilon:area>=-epsilon)issue("OUTLINE_ORIENTATION: contorno anti-horário, recortes horários; área não degenerada.");
    for(let i=0;i<ring.length-1;i++){
      if(Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1])<=epsilon)issue("OUTLINE_ZERO_EDGE");
      const before=ring[(i+ring.length-2)%(ring.length-1)],at=ring[i],after=ring[i+1];
      if(sign(before,at,after)===0&&(at[0]-before[0])*(after[0]-at[0])+(at[1]-before[1])*(after[1]-at[1])<0)issue("OUTLINE_BACKTRACKING_EDGE");
      for(let j=i+1;j<ring.length-1;j++)if(j!==i+1&&!(i===0&&j===ring.length-2)&&intersects(ring[i],ring[i+1],ring[j],ring[j+1]))issue("OUTLINE_SELF_INTERSECTION");
    }
  }
  for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++){
    for(let a=0;a<rings[i].length-1;a++)for(let b=0;b<rings[j].length-1;b++)if(intersects(rings[i][a],rings[i][a+1],rings[j][b],rings[j][b+1]))issue("OUTLINE_RING_INTERSECTION: recortes não podem tocar ou cruzar outros limites.");
    if(i>0&&(inside(rings[i][0],rings[j])||inside(rings[j][0],rings[i])))issue("OUTLINE_NESTED_HOLE");
  }
  for(const hole of v.holes)if(!inside(hole[0],v.outer))issue("OUTLINE_HOLE_OUTSIDE");
});
export type RoofOutline=z.infer<typeof roofOutlineSchema>;
export function roofOutlineAreaM2(value:unknown){const v=roofOutlineSchema.parse(value);return (signedRingAreaMm2(v.outer)+v.holes.reduce((s,h)=>s+signedRingAreaMm2(h),0))/1e6;}
