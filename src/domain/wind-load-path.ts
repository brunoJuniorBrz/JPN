import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { assertGeneratedPhysicalStructure } from "./physical-structure";
import { structureSignature } from "./calculations/project-basis";
import { generatedRoofRegions } from "./roof-load-path";
import { regionElevation, roofGeometryToleranceM as eps } from "./roof-regions";
import { windDeclarationSchema } from "./wind-contracts";
import { calculateWindSpeed } from "./wind-speed";

type V = [number, number, number];
const add = (a: V, b: V) => a.forEach((_, i) => a[i] += b[i]);
const scale = (v: V, s: number) => v.map(x => x*s) as V;
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail = (message: string): never => { throw new Error(`WIND_LOAD_PATH: ${message}`); };
const rectArea = (r: number[]) => (r[2]-r[0])*(r[3]-r[1]);
const overlap = (a: number[], b: number[]) => Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));

/** Integrates the two support reactions of each explicitly simply-supported
 * sheeting span: integral p*(right-u)/span du, integral p*(u-left)/span du.
 * Partition of unity AND linear reproduction preserve force and all moments
 * for rectangular, piecewise-constant zones on the supported planar surfaces.
 * No claim about sheeting/fixing local design or stiffness is made. */
export function distributeWindActions(project: Project, value: unknown) {
  assertGeneratedPhysicalStructure(project,"vento automático");
  const d = windDeclarationSchema.parse(value);
  if (d.geometrySignature !== structureSignature(project)) fail("STALE_WIND: geometria/perfis mudaram; refaça a revisão de zonas.");
  if (project.workspace.spatialPreparation?.roofRegions) fail("regiões compostas ainda não suportadas.");
  const model = generateStructure(project).model ?? fail("geometria incompleta.");
  if (model.nodes.length > 250 || model.pieces.length > 600) fail("limite do adaptador excedido.");
  const surfaces = generatedRoofRegions(project, model);
  const points = new Map(model.nodes.map(n => [n.id, [n.x/1000,n.y/1000,n.z/1000] as V]));
  const pieces = new Map(model.pieces.map(p => [p.id,p]));
  const u = project.roof.fall.startsWith("width") ? 0 : 1, v = u === 0 ? 1 : 0;
  const arm = Math.max(1,...[...points.values()].flatMap(p => p.map(Math.abs)));
  if (new Set(d.cases.map(c => c.id)).size !== d.cases.length) fail("casos repetidos.");
  const geometry = surfaces.regions.map(r => {
    const rows: {at: number; pieces: {id: string; lo: number; hi: number; mid: V}[]}[] = [];
    for (const id of r.purlinPieceIds) {
      const p = pieces.get(id) ?? fail("terça órfã."), a = points.get(p.start)!, b = points.get(p.end)!;
      if (p.role !== "purlin" || Math.abs(a[u]-b[u]) > eps || Math.abs(a[2]-b[2]) > eps ||
        [a,b].some(p => Math.abs(p[2]-regionElevation(r,p[0],p[1])) > eps)) fail("terças fora do plano ou orientação suportada.");
      let row = rows.find(x => Math.abs(x.at-a[u]) <= eps);
      if (!row) { row = {at:a[u],pieces:[]}; rows.push(row); }
      row.pieces.push({id,lo:Math.min(a[v],b[v]),hi:Math.max(a[v],b[v]),mid:scale(a.map((x,i)=>x+b[i]) as V,.5)});
    }
    rows.sort((a,b) => a.at-b.at);
    if (rows.length < 2 || Math.abs(rows[0].at-r.boundsM[u]) > eps || Math.abs(rows.at(-1)!.at-r.boundsM[u+2]) > eps) fail("faltam terças nas bordas.");
    for (const row of rows) {
      row.pieces.sort((a,b) => a.lo-b.lo); let cursor = r.boundsM[v];
      for (const p of row.pieces) {
        if (Math.abs(p.lo-cursor) > eps || p.hi-p.lo <= eps || p.hi > r.boundsM[v+2]+eps) fail("lacuna, sobreposição ou terça degenerada.");
        cursor = p.hi;
      }
      if (Math.abs(cursor-r.boundsM[v+2]) > eps) fail("linha de terças incompleta.");
    }
    return {r,rows};
  });
  const cases = d.cases.map(c => {
    if(c.speedCalculation){
      const speed=calculateWindSpeed(c.speedCalculation),height=Math.max(...model.nodes.map(n=>n.z))/1000;
      const same=(a:number,b:number)=>Math.abs(a-b)<=128*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
      if(!same(speed.dynamicPressurePa,c.dynamicPressurePa)||!same(speed.input.v0Mps,d.building.basicVelocityMS)||!same(speed.input.heightM,height))fail(`${c.id}: STALE_WIND_SPEED — pressão, V0 ou altura divergem do cálculo rastreável; calcule novamente.`);
    }
    if (new Set(c.zones.map(z => z.id)).size !== c.zones.length) fail(`${c.id}: IDs de zonas repetidos.`);
    if (new Set(c.zones.map(z => z.internalCoefficient)).size !== 1) fail(`${c.id}: volume fechado único exige uma hipótese de pressão interna por caso.`);
    for (const z of c.zones) if (!surfaces.regions.some(r => r.id === z.regionId)) fail(`${c.id}: zona refere superfície inexistente.`);
    for (const r of surfaces.regions) {
      const zones = c.zones.filter(z => z.regionId === r.id);
      for (const z of zones) if (z.boundsM.some((x,i) => i < 2 ? x < r.boundsM[i]-eps : x > r.boundsM[i]+eps)) fail(`${z.id}: zona fora da superfície.`);
      for (let i=0;i<zones.length;i++) for (let j=i+1;j<zones.length;j++) if (overlap(zones[i].boundsM,zones[j].boundsM) > 0) fail(`${c.id}: sobreposição de zonas.`);
      if (Math.abs(zones.reduce((s,z)=>s+rectArea(z.boundsM),0)-rectArea(r.boundsM)) > 1e-10*Math.max(1,rectArea(r.boundsM))) fail(`${c.id}: zonas devem cobrir toda superfície, inclusive pressão zero explícita.`);
    }
    const loads = new Map<string,V>();
    const zones = c.zones.map(z => {
      const {r,rows} = geometry.find(g => g.r.id === z.regionId)!;
      const surfaceFactor = Math.hypot(1,r.plane.dzDx,r.plane.dzDy);
      const outwardNormal = scale([-r.plane.dzDx,-r.plane.dzDy,1],1/surfaceFactor);
      const netPressurePa = c.dynamicPressurePa*(z.externalCoefficient-z.internalCoefficient);
      const tractionPa = scale(outwardNormal,-netPressurePa);
      const areaM2 = rectArea(z.boundsM)*surfaceFactor;
      const center: V = [(z.boundsM[0]+z.boundsM[2])/2,(z.boundsM[1]+z.boundsM[3])/2,0];
      center[2] = regionElevation(r,center[0],center[1]);
      const expectedForceN = scale(tractionPa,areaM2), expectedMomentNm = cross(center,expectedForceN);
      const distributedForceN: V = [0,0,0], distributedMomentNm: V = [0,0,0]; let distributedAreaM2 = 0;
      const contributions: {pieceId:string; spanM:[number,number]; projectedReactionWidthM:number; effectiveAreaM2:number; forcePerLengthNM:V; forceN:V; momentNm:V}[] = [];
      for (let i=0;i<rows.length-1;i++) {
        const left = rows[i].at, right = rows[i+1].at;
        const a = Math.max(left,z.boundsM[u]), b = Math.min(right,z.boundsM[u+2]);
        if (b <= a) continue;
        // Integrals of the affine support-reaction shape functions.
        const widths = [(b-a)*(right-(a+b)/2)/(right-left),(b-a)*((a+b)/2-left)/(right-left)];
        for (let j=0;j<2;j++) for (const p of rows[i+j].pieces) {
          const lo = Math.max(p.lo,z.boundsM[v]), hi = Math.min(p.hi,z.boundsM[v+2]);
          if (hi <= lo) continue;
          if (Math.abs(lo-p.lo) > eps || Math.abs(hi-p.hi) > eps) fail(`${z.id}/${p.id}: fronteira longitudinal corta peça; carga parcial exige discretização explícita ainda não suportada.`);
          const effectiveAreaM2 = widths[j]*surfaceFactor*(p.hi-p.lo);
          const forcePerLengthNM = scale(tractionPa,widths[j]*surfaceFactor);
          const forceN = scale(forcePerLengthNM,p.hi-p.lo), momentNm = cross(p.mid,forceN);
          contributions.push({pieceId:p.id,spanM:[left,right],projectedReactionWidthM:widths[j],effectiveAreaM2,forcePerLengthNM,forceN,momentNm});
          distributedAreaM2 += effectiveAreaM2; add(distributedForceN,forceN); add(distributedMomentNm,momentNm);
          const sum = loads.get(p.id) ?? [0,0,0]; add(sum,forcePerLengthNM); loads.set(p.id,sum);
        }
      }
      const forceScale = Math.max(1,Math.abs(netPressurePa)*areaM2);
      if (![areaM2,distributedAreaM2,...expectedForceN,...expectedMomentNm,...distributedForceN,...distributedMomentNm].every(Number.isFinite) ||
        Math.abs(areaM2-distributedAreaM2) > 1e-10*Math.max(1,areaM2) ||
        expectedForceN.some((x,i) => Math.abs(x-distributedForceN[i]) > 1e-10*forceScale) ||
        expectedMomentNm.some((x,i) => Math.abs(x-distributedMomentNm[i]) > 1e-10*forceScale*arm)) fail(`${z.id}: conservação de área/força/momento falhou.`);
      return {declaration:z,netPressurePa,outwardNormal,areaM2,distributedAreaM2,expectedForceN,expectedMomentNm,distributedForceN,distributedMomentNm,contributions};
    });
    const forceN: V = [0,0,0], momentNm: V = [0,0,0];
    for (const z of zones) {add(forceN,z.distributedForceN);add(momentNm,z.distributedMomentNm);}
    return {caseId:c.id,zones,forceN,momentNm,loads:[...loads].map(([pieceId,forcePerLengthNM]) => ({pieceId,forcePerLengthNM}))};
  });
  return {schema_version:"jpn.wind-load-path/1" as const,units:"SI" as const,approved:false as const,
    declaration:d,regions:surfaces,cases,limitations:["Apenas cobertura global estática; fachadas, fixadores e telhamento local não verificados.","Parâmetros, zonas e fatores fornecidos pelo engenheiro; conformidade normativa pendente."]};
}
