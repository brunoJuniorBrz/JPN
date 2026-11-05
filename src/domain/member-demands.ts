import { mixedInputHash, mixedStations, verifyMixedResult } from "./mixed-analysis";
import { anyMixedRequestSchema, anyMixedResultSchema, verifyLoadingTrace } from "./structural-loading";
import type { discretizeGeometry } from "./spatial-connectivity";

export type DemandInput = {request:unknown;input_sha256:string;preparation_sha256:string;mapping:ReturnType<typeof discretizeGeometry>};
export type DemandForces = {nN:number;vyN:number|null;vzN:number|null;tNm:number|null;myNm:number|null;mzNm:number|null};
export type DemandRow = {id:string;pieceId:string;segmentId:string;combinationId:string;kind:"frame"|"axial";
  stationIndex:number;segmentPositionM:number;originalPositionM:number;originalFraction:number;
  forces:DemandForces;translationLocalM:[number,number,number]|null};
export type DemandComponent = keyof DemandForces;
export const demandComponents:DemandComponent[] = ["nN","vyN","vzN","tNm","myNm","mzNm"];
function fail(s:string):never{throw new Error(`DEMAND_TRACE_INVALID: ${s}`);}
const near=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));

/** Signed, concurrent SAMPLE demands. No interaction of separately enveloped
 * maxima, no extrema search between samples, no resistance or second solver. */
export async function extractMemberDemands(prepared:DemandInput,value:unknown){
  const request=anyMixedRequestSchema.parse(prepared.request),result=anyMixedResultSchema.parse(value);
  const hash=await mixedInputHash(request);
  if(!/^[a-f0-9]{64}$/.test(prepared.preparation_sha256))fail("assinatura de preparação ausente ou inválida.");
  if(hash!==prepared.input_sha256||result.schema_version!==request.schema_version.replace("mixed3d/","mixed3d-result/"))fail("versão/hash da entrada incompatível.");
  verifyMixedResult(request,result,hash);verifyLoadingTrace(request,result);
  const map=prepared.mapping;
  if(map.schema_version!=="jpn.geometry-physical-map/1"||map.units!=="mm"||map.members.length!==request.members.length||new Set(map.members.map(m=>m.id)).size!==map.members.length)fail("mapeamento de segmentos incompleto ou repetido.");
  if(map.nodes.length!==request.nodes.length||new Set(map.nodes.map(n=>n.id)).size!==map.nodes.length||map.nodes.some(n=>{
    const p=request.nodes.find(p=>p.id===n.id);return !p||!near(p.x_m,n.x/1000)||!near(p.y_m,n.y/1000)||!near(p.z_m,n.z/1000);
  }))fail("nós do mapeamento diferem da entrada física.");
  const nodes=new Map(request.nodes.map(n=>[n.id,n]));
  for(const m of map.members){
    const physical=request.members.find(p=>p.id===m.id),a=nodes.get(m.start),b=nodes.get(m.end);
    if(!physical||physical.start!==m.start||physical.end!==m.end||!a||!b||!m.originalId||![m.t0,m.t1,m.lengthMm].every(Number.isFinite)||m.t0<0||m.t1>1||m.t0>=m.t1||m.lengthMm<=0||m.originalStart!==(m.t0===0)||m.originalEnd!==(m.t1===1))fail("identidade/extremos/intervalo original inválidos.");
    const length=Math.hypot(b.x_m-a.x_m,b.y_m-a.y_m,b.z_m-a.z_m);
    if(!near(length,m.lengthMm/1000))fail("comprimento físico não conservado.");
    for(const combo of Object.values(result.combinations))if(!near(combo.members[m.id].length_m,length))fail("comprimento da resposta difere da geometria física.");
  }
  const pieceIds=[...new Set(map.members.map(m=>m.originalId))];
  const pieces=pieceIds.map(pieceId=>{
    const segments=map.members.filter(m=>m.originalId===pieceId).sort((a,b)=>a.t0-b.t0);
    const physical=request.members.find(m=>m.id===segments[0].id)!,lengthM=segments.reduce((s,m)=>s+m.lengthMm/1000,0);
    let cursor=0;
    for(const s of segments){
      const m=request.members.find(m=>m.id===s.id)!;
      if(!near(cursor,s.t0)||!near((s.t1-s.t0)*lengthM,s.lengthMm/1000)||m.kind!==physical.kind)fail("lacuna, sobreposição, tipo ou escala de posição incoerente na peça.");
      if(m.kind==="frame"&&physical.kind==="frame"&&(m.rotation_deg!==physical.rotation_deg||m.material!==physical.material||m.section!==physical.section))fail("eixos/propriedades diferentes dentro de uma peça original.");
      if(cursor!==0&&segments[segments.indexOf(s)-1].end!==s.start)fail("segmentos não formam uma peça contínua orientada.");
      cursor=s.t1;
    }
    if(!near(cursor,1)||segments[0].t0!==0||segments.at(-1)!.t1!==1)fail("extremos originais não cobertos.");
    const samples:DemandRow[]=[],kinematics=[];
    for(const combination of request.combinations)for(const segment of segments){
      const c=result.combinations[combination.id],response=c.members[segment.id];
      const stations=response.kind==="frame"?mixedStations(response)!:[0,1].map(t=>({x_m:t*response.length_m,n_n:response.axial_n,vy_n:null,vz_n:null,t_nm:null,my_nm:null,mz_nm:null}));
      if(stations.length!==(response.kind==="frame"?5:2))fail("amostragem de estações incompatível.");
      for(const [i,s] of stations.entries()){
        const fraction=i/(stations.length-1);
        if(!near(s.x_m,response.length_m*fraction))fail("estação fora da malha amostrada declarada pelo solver.");
        samples.push({id:JSON.stringify([pieceId,segment.id,combination.id,i]),pieceId,segmentId:segment.id,combinationId:combination.id,kind:response.kind,stationIndex:i,
          segmentPositionM:s.x_m,originalPositionM:segment.t0*lengthM+s.x_m,originalFraction:segment.t0+fraction*(segment.t1-segment.t0),
          forces:{nN:s.n_n,vyN:s.vy_n,vzN:s.vz_n,tNm:s.t_nm,myNm:s.my_nm,mzNm:s.mz_nm},
          translationLocalM:"translation_local_m" in s?s.translation_local_m??null:null});
      }
      // Rotations are global NODAL results, never fabricated at inner stations.
      kinematics.push({segmentId:segment.id,combinationId:combination.id,
        start:{nodeId:segment.start,...c.nodes[segment.start]},end:{nodeId:segment.end,...c.nodes[segment.end]}});
    }
    const critical=Object.fromEntries(demandComponents.map(component=>{
      const applicable=samples.filter(s=>s.forces[component]!==null);
      if(!applicable.length)return [component,null];
      const min=applicable.reduce((a,b)=>b.forces[component]!<a.forces[component]!?b:a);
      const max=applicable.reduce((a,b)=>b.forces[component]!>a.forces[component]!?b:a);
      const absolute=applicable.reduce((a,b)=>Math.abs(b.forces[component]!)>Math.abs(a.forces[component]!)?b:a);
      return [component,{minimum:min.id,maximum:max.id,absolute:absolute.id}];
    })) as Record<DemandComponent,{minimum:string;maximum:string;absolute:string}|null>;
    return {pieceId,kind:physical.kind,lengthM,
      axes:physical.kind==="frame"?{system:"PyNiteFEA local xyz" as const,rotationDeg:physical.rotation_deg,materialId:physical.material,sectionId:physical.section}:null,
      segments,samples,critical,kinematics};
  });
  return {schema_version:"jpn.member-demands/1" as const,units:"SI" as const,approvedForFabrication:false as const,
    binding:{project:request.project,inputSha256:hash,preparationSha256:prepared.preparation_sha256,resultSha256:await mixedInputHash(result),solver:result.solver},
    conventions:{normal:"positivo tração; negativo compressão",frame:"esforços locais, ações do trecho final sobre o inicial; mesma convenção do motor JPN/PyNite",position:"metros desde o início orientado do segmento/peça original",nodalKinematics:"translações e rotações globais nos nós; rotações ausentes no interior não interpoladas"},
    sampling:{frameStationsPerSegment:5,axialStationsPerSegment:2,continuousExtremaLocated:false as const,
      limitations:["Máximos/mínimos apenas nas estações disponíveis; não são extremos contínuos garantidos.","Cada extremo aponta para um vetor concomitante de esforços de uma única estação e combinação.","Eixos globais internos do pórtico não são retornados pelo contrato misto; nenhuma matriz de rotação foi reconstruída. Giro e extremos físicos são preservados."]},pieces};
}
export type MemberDemands=Awaited<ReturnType<typeof extractMemberDemands>>;
