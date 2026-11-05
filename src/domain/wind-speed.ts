import { z } from "zod";
import { engineeringReferenceSchema } from "./engineering-combinations";
import recovered from "../../data/normas/nbr6123-2023-speed.json" with { type: "json" };

export const windSpeedInputSchema=z.object({schema_version:z.literal("jpn.wind-speed/1"),edition:z.literal("2023-original"),
  v0Mps:z.number().finite().positive().max(150),heightM:z.number().finite().positive().max(500),heightReference:z.literal("model-base-z0"),
  topography:z.literal("flat-or-gently-undulating"),roughnessTransition:z.literal("none"),category:z.enum(["I","II","III","IV","V"]),sizeClass:z.enum(["A","B","C"]),
  s3:z.number().finite().positive().max(10),reference:engineeringReferenceSchema.extend({standard:z.literal("ABNT NBR 6123"),edition:z.literal("2023")}),
}).strict();
export type WindSpeedInput=z.infer<typeof windSpeedInputSchema>;
// NBR6123:2023 5.3.3, Tables 1 and 2. Fr ALWAYS uses category II.
const table=recovered.exposure.categories;

const exposureInputSchema=windSpeedInputSchema.pick({heightM:true,category:true,sizeClass:true});

/** S2 can be compared independently without fabricating V0 or S3 for a
 * published example that does not document those inputs unambiguously. */
export function calculateWindExposure(value:unknown){
  const input=exposureInputSchema.parse(value),row=table[input.category],i=({A:0,B:1,C:2} as const)[input.sizeClass];
  if(input.heightM>row.zg)throw Error("WIND_SPEED_DOMAIN: altura acima da camada limite da categoria; outro procedimento é necessário.");
  const effectiveHeightM=Math.max(row.minimumHeightM,input.heightM),b=row.b[i],p=row.p[i],fr=recovered.exposure.frCategoryII[i],s2=b*fr*(effectiveHeightM/10)**p;
  return {s2,b,p,fr,effectiveHeightM,boundaryLayerHeightM:row.zg};
}

export function calculateWindSpeed(value:unknown){
  const input=windSpeedInputSchema.parse(value),exposure=calculateWindExposure({heightM:input.heightM,category:input.category,sizeClass:input.sizeClass}),s1=recovered.flatTopography.value,{s2}=exposure;
  const vkMps=input.v0Mps*s1*s2*input.s3,dynamicPressurePa=recovered.pressure.value*vkMps*vkMps;
  if(!Number.isFinite(dynamicPressurePa)||dynamicPressurePa>1e6)throw Error("WIND_SPEED_DOMAIN: pressão fora do contrato físico.");
  return {schema_version:"jpn.wind-speed-result/1" as const,input,s1,...exposure,s3:input.s3,vkMps,dynamicPressurePa,
    referenceAirDensityKgM3:recovered.referenceDensity.value,clauses:["4.2","5.2(a)","5.3.3 / Tables 1-3"],
    computed:["S1-flat-terrain","S2","Vk","q"],declared:["V0/location-source","roughness-category","size-class","S3"],
    currentEditionCorrectionsVerified:false as const,completeWindAssessment:false as const,computedStructuralApproval:false as const};
}
