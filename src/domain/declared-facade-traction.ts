import {declaredFacadeTractionSchema} from "./declared-facade-traction-contract";
export {declaredFacadeTractionSchema} from "./declared-facade-traction-contract";
export type {DeclaredFacadeTraction} from "./declared-facade-traction-contract";
import type {DeclaredFacadeTraction} from "./declared-facade-traction-contract";
import type {Project} from "./models";
import {structureSignature} from "./calculations/project-basis";
import {resolvePhysicalStructure} from "./physical-structure";
import {auditPhysicalFacadeEnvelope} from "./physical-facade-envelope";
import {toFacadeLocal,fromFacadeLocal,facadeOutwardNormal} from "./physical-facades";

type V=[number,number,number];
const add=(a:V,b:V)=>{for(let i=0;i<3;i++)a[i]+=b[i];};
const mul=(a:V,x:number):V=>[a[0]*x,a[1]*x,a[2]*x];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
function fail(code:string,message:string):never{throw Error(code+": "+message);}
type Profile=NonNullable<DeclaredFacadeTraction["cases"][number]["zones"][number]["profile"]>;
/** Integrals over [c0,c1] (m) of p and p*(u-c0), p piecewise constant. */
function spanIntegrals(profile:Profile,c0:number,c1:number){
  let i0=0,i1=0;
  for(const s of profile){
    const a=Math.max(s.startM,c0),b=Math.min(s.endM,c1);
    if(b<=a)continue;
    i0+=s.netPressurePa*(b-a);
    i1+=s.netPressurePa*((b-c0)**2-(a-c0)**2)/2;
  }
  return [i0,i1] as const;
}
/** Bind an external pressure scenario to exact physical facade geometry.
 * This is only mechanical transmission of a supplied pressure; Cp/Cpi,
 * incident wind factors and compliance with ABNT are NEVER inferred. */
export function declaredFacadeTractionSignature(p:Project){
  if(!p.workspace.physicalStructure||!p.workspace.spatialPreparation?.physicalFacades)
    fail("FACADE_DECLARATION_PENDING","estrutura e fachadas físicas são obrigatórias");
  return JSON.stringify({
    structure:structureSignature(p),
    facades:p.workspace.spatialPreparation.physicalFacades,
  });
}
export function distributeDeclaredFacadeTractions(project:Project,raw:unknown){
  const d=declaredFacadeTractionSchema.parse(raw);
  if(d.physicalSignature!==declaredFacadeTractionSignature(project))
    fail("FACADE_STALE_PRESSURE","a geometria de fachada ou estrutura mudou depois da revisão");
  const geometry=resolvePhysicalStructure(project).model;
  if(!geometry)fail("FACADE_STRUCTURE_PENDING","falta geometria estrutural física");
  const site=auditPhysicalFacadeEnvelope(project.workspace.spatialPreparation!.physicalFacades,geometry);
  const faces=site.geometry.facades;
  const nodes=new Map(geometry.nodes.map(n=>[n.id,n])),
    pieces=new Map(geometry.pieces.map(p=>[p.id,p]));
  const byId=new Map(faces.map(f=>[f.id,f]));
  if(new Set(d.cases.map(c=>c.id)).size!==d.cases.length)
    fail("FACADE_DUPLICATE_CASE","identificadores de casos repetidos");
  const availableCases=new Set(project.workspace.spatialPreparation?.cases.map(c=>c.id)??[]);
  const cases=d.cases.map(c=>{
    if(!availableCases.has(c.id))fail("FACADE_CASE_UNKNOWN",c.id+" não está cadastrado no modelo");
    if(new Set(c.zones.map(z=>z.facadeId)).size!==c.zones.length||
      c.zones.length!==faces.length||c.zones.some(z=>!byId.has(z.facadeId)))
      fail("FACADE_ZONE_COVERAGE",c.id+" deve declarar pressão ou pressão zero explicitamente em CADA fachada");
    const forceN:V=[0,0,0],momentNm:V=[0,0,0];
    const columnLoads=new Map<string,V>();
    const zones=c.zones.map(z=>{
      const f=byId.get(z.facadeId)!,audit=site.faces.find(x=>x.id===f.id)!;
      if(f.kind!=="wall"||f.openings.length||f.outer.length!==5)
        fail("FACADE_OPENING_DISTRIBUTION_PENDING",f.id+" exige integração de geometria irregular e recortes");
      if(f.enclosure!=="cladded")
        fail("FACADE_ENCLOSURE_UNREVIEWED",f.id+" não tem revestimento integral explicitamente declarado");
      const all=f.outer.slice(0,-1).map(p=>toFacadeLocal(f.outward,p));
      const uvals=[...new Set(all.map(p=>p[0]))].sort((a,b)=>a-b),
        zvals=[...new Set(all.map(p=>p[1]))].sort((a,b)=>a-b);
      if(uvals.length!==2||zvals.length!==2||
        new Set(all.map(p=>JSON.stringify(p))).size!==4||
        all.some(p=>!uvals.includes(p[0])||!zvals.includes(p[1])))
        fail("FACADE_SLOPED_UNSUPPORTED",f.id+" não é painel retangular completo");
      const widthM=(uvals[1]-uvals[0])/1000,
        heightM=(zvals[1]-zvals[0])/1000,
        expectedAreaM2=widthM*heightM;
      if(!near(expectedAreaM2,audit.verticalAreaM2)||widthM<=0||heightM<=0)
        fail("FACADE_GEOMETRIC_AREA",f.id+" não conserva área vertical");
      const columns=f.supportPieceIds.map(pieceId=>{
        const member=pieces.get(pieceId);
        if(!member||member.role!=="column")
          fail("FACADE_PHYSICAL_COLUMN",f.id+"/"+pieceId+" precisa ser pilar real");
        const A=nodes.get(member.start),B=nodes.get(member.end);
        if(!A||!B)fail("FACADE_COLUMN_NODE",pieceId+" tem nó ausente");
        const a=toFacadeLocal(f.outward,[A.x,A.y,A.z]),
          b=toFacadeLocal(f.outward,[B.x,B.y,B.z]);
        if(!near(a[0],b[0])||!near(Math.min(a[1],b[1]),zvals[0])||
          !near(Math.max(a[1],b[1]),zvals[1]))
          fail("FACADE_COLUMN_SEGMENTATION_REQUIRED",pieceId+" não cobre exatamente a altura da parede");
        return {pieceId,at:a[0],lengthM:Math.hypot(B.x-A.x,B.y-A.y,B.z-A.z)/1000,
          midpoint:[(A.x+B.x)/2000,(A.y+B.y)/2000,(A.z+B.z)/2000] as V};
      }).sort((a,b)=>a.at-b.at);
      if(columns.length<2||!near(columns[0].at,uvals[0])||
        !near(columns.at(-1)!.at,uvals[1])||
        columns.some((col,i)=>i>0&&col.at-columns[i-1].at<=1e-7))
        fail("FACADE_COLUMN_BOUNDARIES",f.id+" exige pilares físicos distintos nas duas bordas");
      const prof=z.profile;
      if(prof){
        let cursor=0,integral=0;
        for(const seg of prof){
          if(!near(seg.startM,cursor)||seg.endM<=seg.startM)
            fail("FACADE_PROFILE_COVERAGE",f.id+" perfil deve ser contíguo, crescente e iniciar em 0");
          integral+=seg.netPressurePa*(seg.endM-seg.startM);cursor=seg.endM;
        }
        if(!near(cursor,widthM))fail("FACADE_PROFILE_COVERAGE",f.id+" perfil deve cobrir exatamente a largura da parede");
        if(Math.abs(integral/widthM-z.netPressurePa)>1e-9*Math.max(1,Math.abs(z.netPressurePa)))
          fail("FACADE_PROFILE_MEAN",f.id+" netPressurePa deve ser a média ponderada do perfil");
      }
      const unit=mul(facadeOutwardNormal(f.outward),-1),
        traction=mul(facadeOutwardNormal(f.outward),-z.netPressurePa),
        expectedForceN=mul(traction,expectedAreaM2);
      let expectedMomentNm:V=cross(mul(audit.centroidMm,.001),expectedForceN);
      if(prof){
        const planeMm=f.outer[0][f.outward.endsWith("X")?0:1];
        expectedMomentNm=[0,0,0];
        for(const seg of prof){
          const centroid=fromFacadeLocal(f.outward,planeMm,[uvals[0]+(seg.startM+seg.endM)*500,(zvals[0]+zvals[1])/2]);
          add(expectedMomentNm,cross(mul(centroid,.001),mul(unit,seg.netPressurePa*(seg.endM-seg.startM)*heightM)));
        }
      }
      const distributedForceN:V=[0,0,0],distributedMomentNm:V=[0,0,0];
      let distributedAreaM2=0;
      const contributions=columns.map((col,i)=>{
        const left=i?(columns[i-1].at+col.at)/2:uvals[0],
          right=i+1<columns.length?(col.at+columns[i+1].at)/2:uvals[1],
          tributaryWidthM=(right-left)/1000;
        if(tributaryWidthM<=0||!near(col.lengthM,heightM))
          fail("FACADE_TRIBUTARY_UNSUPPORTED",col.pieceId+" possui altura/tributação inválida");
        let forcePerLengthNM=mul(traction,tributaryWidthM);
        if(prof){
          const here=(col.at-uvals[0])/1000;
          let lambda=0;
          if(i>0){const c0=(columns[i-1].at-uvals[0])/1000,[,i1]=spanIntegrals(prof,c0,here);lambda+=i1/(here-c0);}
          if(i+1<columns.length){const c1=(columns[i+1].at-uvals[0])/1000,[i0,i1]=spanIntegrals(prof,here,c1),L=c1-here;
            lambda+=i0-i1/L;}
          forcePerLengthNM=mul(unit,lambda);
        }
        const forceN=mul(forcePerLengthNM,col.lengthM),
          momentNm=cross(col.midpoint,forceN);
        add(distributedForceN,forceN);
        add(distributedMomentNm,momentNm);
        distributedAreaM2+=tributaryWidthM*col.lengthM;
        const combined=columnLoads.get(col.pieceId)??[0,0,0] as V;
        add(combined,forcePerLengthNM);columnLoads.set(col.pieceId,combined);
        return {pieceId:col.pieceId,tributaryWidthM,forcePerLengthNM,forceN,momentNm};
      });
      const forceScale=Math.max(1,Math.abs(z.netPressurePa)*expectedAreaM2);
      if(!near(distributedAreaM2,expectedAreaM2)||
        expectedForceN.some((v,i)=>Math.abs(v-distributedForceN[i])>1e-10*forceScale)||
        expectedMomentNm.some((v,i)=>Math.abs(v-distributedMomentNm[i])>1e-10*forceScale*
          Math.max(1,Math.hypot(...audit.centroidMm)/1000)))
        fail("FACADE_CONSERVATION",f.id+" não conserva área, força ou momentos globais");
      add(forceN,expectedForceN);add(momentNm,expectedMomentNm);
      return {facadeId:f.id,netPressurePa:z.netPressurePa,source:z.source,revision:z.revision,
        calculationBasis:z.calculationBasis,areaM2:expectedAreaM2,expectedForceN,expectedMomentNm,
        distributedForceN,distributedMomentNm,contributions};
    });
    return {caseId:c.id,incidenceDeg:c.incidenceDeg,reference:c.reference,forceN,momentNm,
      zones,loads:[...columnLoads].map(([pieceId,forcePerLengthNM])=>({pieceId,forcePerLengthNM}))};
  });
  return {schema_version:"jpn.facade-traction-load-path/1" as const,units:"SI" as const,
    source:d,faceAudit:site,cases,
    mechanicalTransmissionVerified:true as const,
    windNormativeReady:false as const,computedStructuralApproval:false as const,
    fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const,
    limitations:["Pressão líquida foi fornecida externamente e NÃO constitui cálculo ou validação de vento conforme ABNT NBR 6123.",
      "Somente paredes retangulares revestidas sem aberturas e pilares físicos completos nas bordas.",
      "Sem comprovação de comportamento das chapas/fixações, contenções, capacidade dos pilares ou reações/fundações."],
  };
}
