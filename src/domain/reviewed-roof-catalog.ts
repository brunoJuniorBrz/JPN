import { z } from "zod";
import type { Project } from "./models";
import { generateGeometry } from "./calculations/geometry";
import { reviewedRoofScopeSchema, normativeWindDataSchema, normativeFactorsDataSchema,
  type NormativeWindData, type NormativeFactorsData } from "./normative-origin-contracts";
import type { NormativeOriginInput } from "./normative-origin";

// These identifiers describe the supplied documents, not permission to publish their tables.
export const correctedWindDocumentSha256="02528d067892eb645aceec8edf56e73e85c15614d6af2c112e243fdda67a7a90";
export const combinationsDocumentSha256="f4020c7171308ad2b9577c3618f15fad67e413ec0caed70d83f7a7a51a3d2b9c";
const c=z.number().finite().min(-10).max(10),positive=c.positive(),psi=z.tuple([c.min(0).max(1),c.min(0).max(1),c.min(0).max(1)]);
/** Only the small selected extract belongs in licensed PRIVATE configuration.
 * Parsing it does not independently validate its transcription or applicability. */
export const reviewedExtractSchema=z.object({schema_version:z.literal("jpn.owner-normative-extract/1"),
  origin:z.enum(["OWNER_TRANSCRIPTION","TEST_ONLY_NOT_NORMATIVE"]),revision:z.string().trim().min(1),transcriber:z.string().trim().min(1),
  windDocumentSha256:z.literal(correctedWindDocumentSha256),combinationsDocumentSha256:z.literal(combinationsDocumentSha256),
  gable45:z.object({crossWindward:c,crossLeeward:c,parallelLeading:c,parallelRemainder:c}).strict(),
  mono30:z.object({positiveHigh:c,positiveLow:c,negativeHigh:c,negativeLow:c}).strict(),
  airtightCpi:z.tuple([c,c]).refine(([a,b])=>a!==b,"Retain two distinct internal scenarios"),s3Group3:positive,
  factors:z.object({permanentSteel:positive,permanentIndustrialized:positive,permanentFavorable:positive,
    wind:positive,roofLive:positive,psiWind:psi,psiRoofLive:psi}).strict(),
}).strict();
export type ReviewedExtract=z.infer<typeof reviewedExtractSchema>;

export function assertReviewedRoofScope(project:Project,input:NormativeOriginInput){
  reviewedRoofScopeSchema.parse(input.reviewedRoof);
  const p=project.planning,r=project.roof,m=generateGeometry(r,p?.typology).model?.metrics;
  const stop=(reason:string):never=>{throw Error(`REVIEWED_ROOF_DOMAIN: ${reason}`);};
  if(!m||!p||!(p.typology==="gable"||p.typology==="mono"))return stop("geometry incomplete");
  if(r.fall!=="width-positive"||m.widthM!==m.lengthM||p.overhangStartM!==0||p.overhangEndM!==0)return stop("only square plan, width-positive fall, no overhangs");
  const angle=Math.atan(r.slopePercent!/100)*180/Math.PI;
  const target=p.typology==="gable"?45:30;
  if(Math.abs(angle-target)>64*Number.EPSILON*target)return stop("exact tabulated slope only; no interpolation");
  if(p.typology==="gable"?m.lowHeightM/m.widthM>.5:m.lowHeightM/m.widthM>=2)return stop("eaves h/b outside selected table row");
  if(input.incidencesDeg.some(a=>!(p.typology==="gable"?[0,90]:[90,270]).includes(a)))return stop("incidence outside selected rows");
  if(input.speed.sizeClass!=="A"||Math.max(m.widthM,m.lengthM,m.highHeightM)>20)return stop("class A dimensions only");
  const o=input.openings;
  if(o.classification!=="airtight-fixed-windows"||o.dominantFace!=="none"||o.permeabilityPercent!==0||o.faceAreasM2.some(a=>a!==0))return stop("airtight fixed windows required; dominant/permeable openings unsupported");
  const volume=m.widthM*m.lengthM*(m.lowHeightM+m.riseM/2);
  if(Math.abs(o.volumeM3-volume)>1e-10*Math.max(1,volume))return stop("single internal volume differs from geometry");
  return m;
}

/** Convert a bounded private extract into the existing versioned contracts.
 * Ce is used for the primary global roof load, never local cpe medio. */
export function buildReviewedRoofCatalog(project:Project,input:NormativeOriginInput,value:unknown){
  const v=reviewedExtractSchema.parse(value),m=assertReviewedRoofScope(project,input);
  if(input.speed.s3!==v.s3Group3)throw Error("REVIEWED_ROOF_DOMAIN: S3 differs from declared group 3");
  if(input.use!=="roof-primary-8681-2025-individual"||input.windFactorClass!=="WIND")throw Error("REVIEWED_COMBINATION_USE");
  for(const a of input.actions)if(!(a.category==="permanent"&&a.exclusiveGroup===null&&["STEEL_SELF_WEIGHT","INDUSTRIALIZED_ROOF"].includes(a.factorClass)||a.category==="variable"&&a.factorClass==="ROOF_LIVE"))throw Error("REVIEWED_ACTION_CLASS: individual direct permanent and roof use only");
  const ws=(item:string):NormativeWindData["rows"][number]["source"]=>({standard:"ABNT NBR 6123",edition:"2023-corrected-2025",errata:"08.04.2025-partial-through-48",
    item,domain:"Primary roof Ce; square plan; gable45 h/b<=0.5 or mono30 h/b<2; airtight 6.3.2.2; all declared restrictions",
    transcriber:v.transcriber,documentSha256:v.windDocumentSha256});
  const fs=(item:string):NormativeFactorsData["source"]=>({standard:"ABNT NBR 8681",edition:"2025",errata:"not-assessed",
    item,domain:"Normal ULS; rare/frequent/quasi-permanent SLS; individual direct G, roof use Q, atomic exclusive wind patterns",
    transcriber:v.transcriber,documentSha256:v.combinationsDocumentSha256});
  const openingValues={enclosure:input.openings.enclosure,classification:input.openings.classification,dominantFace:input.openings.dominantFace,
    faceAreasM2:input.openings.faceAreasM2,permeabilityPercent:input.openings.permeabilityPercent,volumeM3:input.openings.volumeM3};
  const typology=project.planning!.typology as "mono"|"gable",source=ws(typology==="gable"?"6.1.1; Table 7, theta45, h/b<=1/2, note3":"6.1.1; Table 8, theta30, h/b<2");
  const wind:NormativeWindData={schema_version:"jpn.normative-wind-data/1",origin:v.origin,revision:v.revision,rows:input.incidencesDeg.map(incidenceDeg=>{
    const zones:NormativeWindData["rows"][number]["zones"]=[];
    const zone=(id:string,region:number,boundsFraction:[number,number,number,number],value:number)=>zones.push({id,region,kind:"interior",boundsFraction,cpe:{value,source}});
    if(typology==="gable"){
      if(incidenceDeg===90){zone("EFI",1,[0,0,1,1],v.gable45.crossWindward);zone("GHJ",2,[0,0,1,1],v.gable45.crossLeeward);}
      else {const x=Math.min(Math.max(m.widthM/3,m.lengthM/4),2*m.lowHeightM)/m.lengthM;
        for(const region of [1,2]){zone(region===1?"E":"G",region,[0,0,1,x],v.gable45.parallelLeading);zone(region===1?"FI":"HJ",region,[0,x,1,1],v.gable45.parallelRemainder);}}
    }else {zone("HI",1,[0,0,.5,1],incidenceDeg===90?v.mono30.positiveHigh:v.mono30.negativeHigh);zone("LJ",1,[.5,0,1,1],incidenceDeg===90?v.mono30.positiveLow:v.mono30.negativeLow);}
    return {id:`R${incidenceDeg}`,source,domain:{typology,fall:"width-positive",slopeDeg:typology==="gable"?45:30,incidenceDeg,
      widthM:[m.widthM,m.widthM],lengthM:[m.lengthM,m.lengthM],heightM:[m.highHeightM,m.highHeightM],openings:openingValues,selectionRule:"exact-row-no-interpolation"},zones,
      cpiCases:v.airtightCpi.map((value,i)=>({id:`I${i}`,coefficient:{value,source:ws("6.3.2.2; printed45 / PDF57; both alternatives")}}))};
  })};
  const purposes=["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"] as const;
  const recipeClause={ULS:"5.1.3.1", "SLS-characteristic":"5.1.5.4 (rare)","SLS-frequent":"5.1.5.3","SLS-quasi-permanent":"5.1.5.2"};
  const factors:NormativeFactorsData={schema_version:"jpn.normative-factors-data/1",origin:v.origin,revision:v.revision,use:input.use,source:fs("5.1.2-5.1.5; Tables 1,4,6"),
    recipes:purposes.map(purpose=>({id:purpose,purpose,source:fs(recipeClause[purpose]),leading:purpose==="SLS-quasi-permanent"?"none":"each-variable",leadingEffect:"unfavorable",includePermanentOnly:true})),factors:[]};
  const classes=[...new Map([...input.actions,{category:"wind" as const,factorClass:"WIND"}].map(a=>[a.factorClass,a])).values()];
  const coeff=(value:number,source:NormativeFactorsData["source"])=>({value,source});
  for(const purpose of purposes)for(const a of classes){
    const permanent=a.category==="permanent",w=a.category==="wind",ps=w?v.factors.psiWind:v.factors.psiRoofLive;
    for(const role of permanent?["permanent"] as const:["leading","accompanying","absent"] as const)for(const effect of ["favorable","unfavorable"] as const){
      let gamma=1,reduction=1,gammaItem="5.1.2.3 (SLS unit factors)",psiItem=recipeClause[purpose];
      if(purpose==="ULS"){
        gamma=permanent?(effect==="favorable"?v.factors.permanentFavorable:a.factorClass==="STEEL_SELF_WEIGHT"?v.factors.permanentSteel:v.factors.permanentIndustrialized):(w?v.factors.wind:v.factors.roofLive);
        gammaItem=permanent?"5.1.4.1; Table1 individual direct G normal":"5.1.4.2; Table4 normal";
        reduction=permanent||role==="leading"?1:ps[0];
      }else if(!permanent)reduction=purpose==="SLS-quasi-permanent"?ps[2]:purpose==="SLS-frequent"?(role==="leading"?ps[1]:ps[2]):role==="leading"?1:ps[1];
      if(!permanent&&(role!=="leading"||purpose==="SLS-frequent"))psiItem+="; Table6 "+(w?"wind":"roof use");
      if(role==="absent"||!permanent&&effect==="favorable"){reduction=0;psiItem="5.1.3/5.1.4.2/5.1.5: omitted favorable or incompatible variable action";}
      factors.factors.push({factorClass:a.factorClass,category:a.category,role,effect,purpose,
        gamma:coeff(gamma,fs(gammaItem)),psi:coeff(reduction,fs(psiItem))});
    }
  }
  return {wind:normativeWindDataSchema.parse(wind),factors:normativeFactorsDataSchema.parse(factors),
    applicability:{eavesHeightM:m.lowHeightM,speedReferenceHeightM:m.highHeightM,hOverB:m.lowHeightM/m.widthM,coefficientKind:"global-Ce",scope:input.reviewedRoof}};
}
