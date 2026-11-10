import type {PhysicalGeometry} from "./structure";
import {inspectPhysicalRoofFaces} from "./physical-roof-faces";
import {signedRingAreaMm2} from "./roof-outline";

/** Physical XY overlap, height/seam and member audit. Never infers loads,
 * restraint, sheeting stiffness, normative capacity or structural approval. */
type P=[number,number];
type P3=[number,number,number];
type Ring=P[];
type Triangle=[P,P,P];
const tolerance=1e-5;
const vector=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const cross=(a:P,b:P)=>a[0]*b[1]-a[1]*b[0];
const turn=(a:P,b:P,c:P)=>cross(vector(b,a),vector(c,a));
const polygonArea=(vertices:P[])=>Math.abs(vertices.reduce((s,p,i)=>{
  const q=vertices[(i+1)%vertices.length];
  return s+p[0]*q[1]-p[1]*q[0];
},0)/2);
const project=(ring:P3[]):Ring=>ring.map(p=>[p[0],p[1]]);
function fail(code:string,message:string):never{throw new Error(code+": "+message);}
function pointOn(p:P,a:P,b:P){
  const d=vector(b,a),v=vector(p,a),d2=d[0]*d[0]+d[1]*d[1];
  const len=Math.sqrt(d2);
  return d2>0&&Math.abs(cross(d,v))<=tolerance*len
    &&v[0]*d[0]+v[1]*d[1]>=-tolerance*len
    &&v[0]*d[0]+v[1]*d[1]<=d2+tolerance*len;
}
function pointLocation(p:P,ring:Ring):"inside"|"outside"|"boundary"{
  let yes=false;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    if(pointOn(p,a,b))return "boundary";
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes?"inside":"outside";
}
function withinFace(p:P,outer:Ring,holes:Ring[]){
  return pointLocation(p,outer)!=="outside"&&!holes.some(h=>pointLocation(p,h)==="inside");
}
/** Break a straight member at every face/hole boundary intersection. A pair of
 * endpoints on a face is NOT enough to prove it does not cross a roof void. */
export function entirePieceOnFace(a:P,b:P,outer:Ring,holes:Ring[]){
  if(!withinFace(a,outer,holes)||!withinFace(b,outer,holes))return false;
  const d=vector(b,a),d2=d[0]*d[0]+d[1]*d[1];
  if(d2<tolerance*tolerance)return false;
  const breakpoints=[0,1];
  for(const ring of [outer,...holes])for(let i=0;i<ring.length-1;i++){
    const p=ring[i],q=ring[i+1],edge=vector(q,p),pa=vector(p,a),den=cross(d,edge);
    if(Math.abs(den)>1e-8){
      const t=cross(pa,edge)/den,u=cross(pa,d)/den;
      if(t>=-1e-10&&t<=1+1e-10&&u>=-1e-10&&u<=1+1e-10)breakpoints.push(Math.min(1,Math.max(0,t)));
    }else if(Math.abs(cross(pa,d))<=tolerance*Math.sqrt(d2)){
      for(const v of [p,q]){
        const n=vector(v,a),t=(n[0]*d[0]+n[1]*d[1])/d2;
        if(t>=0&&t<=1)breakpoints.push(t);
      }
    }
  }
  breakpoints.sort((a,b)=>a-b);
  for(let i=1;i<breakpoints.length;i++){
    const lo=breakpoints[i-1],hi=breakpoints[i];
    if(hi-lo<=1e-10)continue;
    const t=(lo+hi)/2;
    if(!withinFace([a[0]+t*d[0],a[1]+t*d[1]],outer,holes))return false;
  }
  return true;
}
/** Ear clipping of each validated simple ring. A failed triangulation blocks
 * the audit instead of substituting the bounding box for an irregular roof. */
function triangulate(ring:Ring):Triangle[]{
  const points=ring.slice(0,-1),orient=Math.sign(signedRingAreaMm2(ring));
  if(!orient)fail("M37_DEGENERATE_RING","anel sem área");
  const indices=points.map((_,i)=>i),output:Triangle[]=[];
  while(indices.length>3){
    let found=false;
    for(let k=0;k<indices.length;k++){
      const prev=points[indices[(k+indices.length-1)%indices.length]];
      const now=points[indices[k]],next=points[indices[(k+1)%indices.length]];
      if(orient*turn(prev,now,next)<=1e-7)continue;
      const occupied=indices.some(idx=>{
        const p=points[idx];
        if(p===prev||p===now||p===next)return false;
        return orient*turn(prev,now,p)>=-1e-7&&orient*turn(now,next,p)>=-1e-7&&orient*turn(next,prev,p)>=-1e-7;
      });
      if(occupied)continue;
      output.push(orient>0?[prev,now,next]:[next,now,prev]);
      indices.splice(k,1);found=true;break;
    }
    if(!found)fail("M37_TRIANGULATION_UNSUPPORTED","forma côncava não pôde ser triangularizada com segurança");
  }
  const last=indices.map(i=>points[i]) as Triangle;
  output.push(orient>0?last:[last[2],last[1],last[0]]);
  return output;
}
function triangleOverlap(subject:Triangle,clip:Triangle){
  let polygon:P[]=[...subject];
  for(let k=0;k<3&&polygon.length;k++){
    const a=clip[k],b=clip[(k+1)%3],input=polygon;
    polygon=[];
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length];
      const dp=turn(a,b,p),dq=turn(a,b,q),insideP=dp>=-1e-7,insideQ=dq>=-1e-7;
      if(insideP!==insideQ){
        const ratio=dp/(dp-dq);
        polygon.push([p[0]+(q[0]-p[0])*ratio,p[1]+(q[1]-p[1])*ratio]);
      }
      if(insideQ)polygon.push(q);
    }
  }
  return polygon.length>2?polygonArea(polygon):0;
}
function intersectionArea(a:{outer:Ring;holes:Ring[]},b:{outer:Ring;holes:Ring[]}){
  const x=[a.outer,...a.holes].map(triangulate),y=[b.outer,...b.holes].map(triangulate);
  let result=0;
  for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++)
    for(const ta of x[i])for(const tb of y[j])
      result+=(i===0?1:-1)*(j===0?1:-1)*triangleOverlap(ta,tb);
  return Math.max(0,result);
}
function contacts(a:Ring[],b:Ring[]){
  const out:P[]=[];
  for(const first of a)for(let i=0;i<first.length-1;i++)
    for(const second of b)for(let j=0;j<second.length-1;j++){
      const p=first[i],q=first[i+1],r=second[j],s=second[j+1],d=vector(q,p),e=vector(s,r),delta=vector(r,p),den=cross(d,e);
      if(Math.abs(den)>1e-8){
        const t=cross(delta,e)/den,u=cross(delta,d)/den;
        if(t>=-1e-10&&t<=1+1e-10&&u>=-1e-10&&u<=1+1e-10)out.push([p[0]+t*d[0],p[1]+t*d[1]]);
      }else for(const v of [p,q,r,s])if(pointOn(v,p,q)&&pointOn(v,r,s))out.push(v);
    }
  return out;
}
export function auditPhysicalRoofCoverage(raw:unknown,geometry:PhysicalGeometry){
  const inspected=inspectPhysicalRoofFaces(raw),declared=inspected.geometry;
  if(geometry.units!=="mm")fail("M37_UNITS","geometria estrutural deve usar mm");
  const complexity=declared.faces.reduce((s,f)=>s+f.outer.length+f.holes.reduce((sum,h)=>sum+h.length,0),0);
  if(complexity>650)fail("M37_COMPLEXITY_LIMIT","limite de 650 vértices no processo geométrico; dividir a revisão");
  const points=new Map(geometry.nodes.map(n=>[n.id,n])),pieces=new Map(geometry.pieces.map(p=>[p.id,p]));
  const projected=declared.faces.map(f=>({outer:project(f.outer),holes:f.holes.map(project)}));
  const linked=new Set<string>();
  for(let i=0;i<declared.faces.length;i++){
    const f=declared.faces[i],rings=projected[i],plane=inspected.faces[i].plane;
    const elevation=(p:P)=>plane.originMm[2]+(p[0]-plane.originMm[0])*plane.dzDx+(p[1]-plane.originMm[1])*plane.dzDy;
    if(!f.supportPieceIds.length)fail("M37_NO_PURLINS",f.id+" sem terça física associada");
    for(const id of f.supportPieceIds){
      const piece=pieces.get(id);
      if(!piece)fail("M37_ORPHAN_PURLIN",f.id+"/"+id+" peça inexistente");
      if(piece.role!=="purlin")fail("M37_NOT_PURLIN",f.id+"/"+id+" não é terça");
      const a=points.get(piece.start),b=points.get(piece.end);
      if(!a||!b)fail("M37_ORPHAN_NODE",id+" tem nó inexistente");
      if(Math.abs(a.z-elevation([a.x,a.y]))>1e-2||Math.abs(b.z-elevation([b.x,b.y]))>1e-2)
        fail("M37_PURLIN_OFF_PLANE",id+" não pertence ao plano físico");
      if(!entirePieceOnFace([a.x,a.y],[b.x,b.y],rings.outer,rings.holes))
        fail("M37_PURLIN_OUTSIDE",id+" atravessa recorte ou sai da superfície");
      linked.add(id);
    }
  }
  const unlinked=geometry.pieces.filter(p=>p.role==="purlin"&&!linked.has(p.id));
  if(unlinked.length)fail("M37_UNLINKED_PURLIN","terças sem superfície declarada: "+unlinked.slice(0,5).map(p=>p.id).join(","));
  for(let i=0;i<projected.length;i++)for(let j=i+1;j<projected.length;j++){
    const overlapMm2=intersectionArea(projected[i],projected[j]);
    const threshold=Math.max(1e-3,1e-10*Math.min(inspected.faces[i].horizontalAreaM2,inspected.faces[j].horizontalAreaM2)*1e6);
    if(overlapMm2>threshold)fail("M37_ROOF_FACE_OVERLAP",declared.faces[i].id+"/"+declared.faces[j].id+" têm projeção duplicada");
    for(const at of contacts([projected[i].outer,...projected[i].holes],[projected[j].outer,...projected[j].holes])){
      const elevation=(k:number)=>{
        const p=inspected.faces[k].plane;
        return p.originMm[2]+(at[0]-p.originMm[0])*p.dzDx+(at[1]-p.originMm[1])*p.dzDy;
      };
      if(Math.abs(elevation(i)-elevation(j))>1e-2)
        fail("M37_ROOF_SEAM",declared.faces[i].id+"/"+declared.faces[j].id+" têm cotas incompatíveis no encontro");
    }
  }
  return {...inspected,schema_version:"jpn.physical-roof-coverage/1" as const,
    globalCoverage:"no-overlap-and-seams-checked" as const,
    horizontalAreaM2:inspected.faces.reduce((s,f)=>s+f.horizontalAreaM2,0),
    surfaceAreaM2:inspected.faces.reduce((s,f)=>s+f.surfaceAreaM2,0),
    associatedPieceIds:[...linked].sort(),
    faceMemberLinks:declared.faces.map(f=>({faceId:f.id,pieceIds:[...f.supportPieceIds]})),
    declaredUnionOnly:true as const,
    loadingReady:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,
    limitations:["A união projetada cobre as faces DECLARADAS, não comprova que toda a obra foi levantada.",
      "O vínculo geométrico não determina faixas tributárias, comportamento da telha ou transferência de cargas."]};
}
