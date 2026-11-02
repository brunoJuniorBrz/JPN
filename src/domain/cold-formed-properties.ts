import { z } from "zod";
import type { PhysicalGroup } from "./physical-declaration";
// Resolution is an absolute last reported digit in the UNIT OF THE KEY, not
// a universal percentage tolerance. Unknown values remain null.
const q=z.object({value:z.number().finite(),resolution:z.number().finite().positive()}).strict().nullable();
const positive=z.object({value:z.number().finite().positive(),resolution:z.number().finite().positive()}).strict().refine(v=>v.resolution<2*v.value,"Resolution interval must remain positive").nullable();
const text=z.string().trim().min(1).max(1000);
export const coldFormedQuantityKeys=["nominalThicknessMm","effectiveThicknessMm","flatWebMm","flatFlangeMm","flatLipMm","areaCm2","centroidYMm","centroidZMm","iyCm4","izCm4","iyzCm4","wyPositiveCm3","wyNegativeCm3","wzPositiveCm3","wzNegativeCm3","jCm4","warpingCm6","shearCenterYMm","shearCenterZMm","radiusYMm","radiusZMm","principalAngleDeg","torsionalBucklingLengthM"] as const;
export const coldFormedPropertySchema=z.object({
  schema_version:z.literal("jpn.cold-formed-properties/1"),source:text,revision:text,responsible:text,
  dimensionsBasis:z.literal("external-steel-dimensions"),axes:z.literal("solver-local-yz-centroidal-principal"),sectionOriginDescription:text,
  nominalThicknessMm:positive,effectiveThicknessMm:positive,flatWebMm:positive,flatFlangeMm:positive,flatLipMm:positive,
  areaCm2:positive,centroidYMm:q,centroidZMm:q,iyCm4:positive,izCm4:positive,iyzCm4:q,
  wyPositiveCm3:positive,wyNegativeCm3:positive,wzPositiveCm3:positive,wzNegativeCm3:positive,
  jCm4:positive,warpingCm6:positive,shearCenterYMm:q,shearCenterZMm:q,radiusYMm:positive,radiusZMm:positive,principalAngleDeg:q,
  effectiveSection:z.object({areaCm2:positive,wyCm3:positive,wzCm3:positive,method:text,stressState:text,source:text,revision:text}).strict().nullable(),
  restraints:z.array(z.object({positionM:z.number().finite().nonnegative(),flange:z.enum(["positive-z","negative-z","both","web"]),lateral:z.boolean(),torsional:z.boolean(),source:text,revision:text}).strict()).max(500),
  warpingStart:z.enum(["pending","free","restrained"]),warpingEnd:z.enum(["pending","free","restrained"]),torsionalBucklingLengthM:positive,
}).strict();
export type ColdFormedProperties=z.infer<typeof coldFormedPropertySchema>;
export function coldFormedDiagnostics(d:{family:string|null;geometry?:{shape:string;dimensionsMm:Record<string,number|null|undefined>};coldFormed?:ColdFormedProperties},group:PhysicalGroup,lengthM:number){
  const issues:{code:string;message:string}[]=[],add=(code:string,message:string)=>issues.push({code,message}),p=d.coldFormed,g=d.geometry;
  if(d.family!=="cold-formed"||g?.shape!=="u-stiffened"){add("UNSUPPORTED_FAMILY","Domínio piloto: U enrijecido formado a frio, explicitamente identificado.");return {status:"unsupported-model" as const,issues};}
  const {height:h,width:b,lip:c,wallThickness:t,insideRadius:r}=g.dimensionsMm;
  if([h,b,c,t,r].some(x=>x===null||x===undefined))add("INCOMPLETE_GEOMETRY","Dimensões físicas, espessura e raio interno necessários.");
  else if(h!<=2*(r!+t!)||b!<=2*(r!+t!)||c!<=r!+t!||2*c!>=h!||c!>=b!)add("INCOMPATIBLE_GEOMETRY","Dobras, enrijecedores ou larguras planas degenerados; geometria Ue incompatível.");
  if(!p){add("INCOMPLETE_PROPERTIES","Propriedades Ue rastreáveis avançadas ainda não declaradas.");return {status:"pending-data" as const,issues};}
  for(const [key,v]of Object.entries(p))if(v===null)add("MISSING_PROPERTY",`${key}: dado físico ausente.`);
  const band=(v:NonNullable<typeof p.areaCm2>):[number,number]=>[v.value-v.resolution/2,v.value+v.resolution/2];
  const overlaps=(v:NonNullable<typeof p.areaCm2>,a:number,b=a)=>{const [lo,hi]=band(v),eps=64*Number.EPSILON*Math.max(Math.abs(lo),Math.abs(hi),Math.abs(a),Math.abs(b));return lo<=b+eps&&hi>=a-eps;};
  for(const key of ["areaCm2","iyCm4","izCm4","jCm4"] as const)if(p[key]&&group[key]!==null&&!overlaps(p[key]!,group[key]!))add("SOLVER_PROPERTY_MISMATCH",`${key}: intervalos declarados não incluem a propriedade usada no solver.`);
  if(p.nominalThicknessMm&&p.effectiveThicknessMm&&band(p.effectiveThicknessMm)[0]>band(p.nominalThicknessMm)[1])add("INCOHERENT_THICKNESS","Espessura efetiva excede nominal além da resolução declarada.");
  if(h&&b&&c&&t&&r!==null&&r!==undefined)for(const [key,x]of [["flatWebMm",h-2*(r+t)],["flatFlangeMm",b-2*(r+t)],["flatLipMm",c-r-t]] as const)if(p[key]&&!overlaps(p[key]!,x))add("FLAT_WIDTH_MISMATCH",`${key}: dimensão externa de aço e dobras não conferem.`);
  for(const [inertia,radius]of [["iyCm4","radiusYMm"],["izCm4","radiusZMm"]] as const)if(p.areaCm2&&p[inertia]&&p[radius]){
    const [a0,a1]=band(p.areaCm2),[i0,i1]=band(p[inertia]!);if(a0<=0||i0<=0||!overlaps(p[radius]!,10*Math.sqrt(i0/a1),10*Math.sqrt(i1/a0)))add("RADIUS_MISMATCH",`${radius}: r²=I/A incompatível com resoluções e unidades declaradas.`);
  }
  if(p.iyzCm4&&!overlaps(p.iyzCm4,0))add("NONPRINCIPAL_AXES","Iyz não nulo: eixos declarados não são principais como exige este cadastro.");
  if(!p.restraints.length||p.warpingStart==="pending"||p.warpingEnd==="pending")add("MISSING_RESTRAINT","Contenções físicas e condições de empenamento ainda pendentes.");
  if(p.restraints.some(x=>x.positionM>lengthM))add("ORPHAN_RESTRAINT","Contenção fora do comprimento da peça.");
  if(!group.eGpa||!group.gGpa||group.nu===null||Math.abs(group.eGpa/(2*group.gGpa*(1+group.nu))-1)>.001)add("MATERIAL_INCOHERENT","E, G e Poisson ausentes ou incompatíveis com o material isótropo do solver.");
  return {status:issues.length?"pending-data" as const:"pending-normative-source" as const,issues};
}
