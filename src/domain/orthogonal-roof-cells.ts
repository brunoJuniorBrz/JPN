import type {PhysicalGeometry} from "./structure";
import type {PhysicalRoofFaces} from "./physical-roof-faces";

type Vec2=[number,number];
type Bounds=[number,number,number,number];
type RoofFace=PhysicalRoofFaces["faces"][number];
const eps=1e-7;
function fail(why:string):never {throw Error("M39_ORTHOGONAL_ROOF: "+why);}
const almost=(x:number,y:number)=>Math.abs(x-y)<=eps;
const unique=(a:number[])=>[...new Set(a)].sort((x,y)=>x-y);
const xy=(p:[number,number,number]):Vec2=>[p[0]/1000,p[1]/1000];
function interior(point:Vec2,ring:Vec2[]){
  let yes=false;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    if((a[1]>point[1])!==(b[1]>point[1])&&
      point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
/** Partition only rectilinear surfaces into exact rectangular cells. Every
 * cell's sheet-to-purlin load route must be explicitly backed by TWO real
 * boundary purlin segments spanning precisely its longitudinal interval.
 * No interpolated rigidity, free overhang or patchwork load is invented.
 *
 * Segment endpoints are essential: a long beam receiving different widths
 * along its length MUST be physically divided before uniform frame loads
 * can be assigned to the solver without applying loads to absent sheeting. */
export function orthogonalRoofCells(
  face:RoofFace,geometry:PhysicalGeometry,
  transverse:0|1,faceNumber:number,expectedProjectedAreaM2:number
){
  const rings=[face.outer,...face.holes].map(r=>r.map(xy));
  for(const ring of rings)for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    if(!almost(a[0],b[0])&&!almost(a[1],b[1]))
      fail("IRREGULAR_DISTRIBUTION_PENDING: somente contornos ortogonais a X/Y com peças físicas segmentadas");
  }
  const positions=new Map(geometry.nodes.map(n=>[n.id,[n.x/1000,n.y/1000,n.z/1000] as [number,number,number]]));
  const pieces=new Map(geometry.pieces.map(p=>[p.id,p]));
  const longitudinal=transverse===0?1:0;
  const memberData=face.supportPieceIds.map(id=>{
    const p=pieces.get(id);
    if(!p)fail("PURLIN_ORPHAN: "+id+" não existe no modelo");
    if(p.role!=="purlin")fail("PURLIN_ROLE: "+id+" não é terça");
    const a=positions.get(p.start),b=positions.get(p.end);
    if(!a||!b)fail("PURLIN_NODE: peça com nó inexistente");
    if(!almost(a[transverse],b[transverse])||almost(a[longitudinal],b[longitudinal]))
      fail("PURLIN_DIRECTION: terças devem ser paralelas e não degeneradas");
    return {id,at:a[transverse],lo:Math.min(a[longitudinal],b[longitudinal]),hi:Math.max(a[longitudinal],b[longitudinal])};
  });
  const xs=unique([...rings.flat().map(p=>p[0]),...face.supportPieceIds.flatMap(id=>{
    const p=pieces.get(id)!,a=positions.get(p.start)!,b=positions.get(p.end)!;
    return [a[0],b[0]];
  })]);
  const ys=unique([...rings.flat().map(p=>p[1]),...face.supportPieceIds.flatMap(id=>{
    const p=pieces.get(id)!,a=positions.get(p.start)!,b=positions.get(p.end)!;
    return [a[1],b[1]];
  })]);
  if(xs.length>64||ys.length>64||xs.length*ys.length>500)
    fail("CELL_LIMIT: divida as faces em regiões menores para revisar os apoios");
  const cells:{id:string;boundsM:Bounds;purlinPieceIds:string[]}[]=[];
  let area=0;
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
    const bounds:Bounds=[xs[i],ys[j],xs[i+1],ys[j+1]];
    const width=xs[i+1]-xs[i],height=ys[j+1]-ys[j];
    if(width<=eps||height<=eps)fail("GRID_DEGENERATE: separação de coordenadas não suporta integração");
    const mid:Vec2=[(xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2];
    if(!interior(mid,rings[0])||rings.slice(1).some(r=>interior(mid,r)))continue;
    const lo=bounds[longitudinal],hi=bounds[longitudinal+2],
      transverseLo=bounds[transverse],transverseHi=bounds[transverse+2];
    const eligible=memberData.filter(p=>
      (almost(p.at,transverseLo)||almost(p.at,transverseHi))&&
      p.hi>lo+eps&&p.lo<hi-eps
    );
    for(const m of eligible){
      if(!almost(m.lo,lo)||!almost(m.hi,hi))
        fail("PURLIN_SEGMENTATION_REQUIRED: "+m.id+" precisa ser segmentada nos limites das faixas para não aplicar carga fora da área");
    }
    const left=eligible.filter(m=>almost(m.at,transverseLo)),
      right=eligible.filter(m=>almost(m.at,transverseHi));
    if(left.length!==1||right.length!==1)
      fail("PURLIN_CELL_SUPPORT_PENDING: cada célula exige terças explícitas nas duas bordas, em todo o comprimento");
    const id="F"+(faceNumber+1)+"_C"+(cells.length+1);
    cells.push({id,boundsM:bounds,purlinPieceIds:[left[0].id,right[0].id]});
    area+=width*height;
    if(cells.length>20)fail("CELL_LIMIT: mais de vinte células; divida a cobertura em panos menores");
  }
  if(!cells.length||Math.abs(area-expectedProjectedAreaM2)>1e-10*Math.max(1,expectedProjectedAreaM2))
    fail("CELL_COVERAGE: decomposição não conserva área real ou contém região sem cobertura");
  const used=new Set(cells.flatMap(c=>c.purlinPieceIds));
  if(memberData.some(m=>!used.has(m.id)))
    fail("PURLIN_UNLOADED: terça declarada sem célula tributária; revisar geometria");
  return cells;
}
