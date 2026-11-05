/** TEST_ONLY_NOT_NORMATIVE. Synthetic mechanics/selection fixtures, no ABNT factors. */
import type { Project } from "../models";
import { generatedRoofRegions } from "../roof-load-path";
import { generateStructure } from "../calculations/structure";
import type { NormativeOriginInput,NormativeFiles } from "../normative-origin";
import type { NormativeWindData,NormativeFactorsData,NormativeSource } from "../normative-origin-contracts";

export function m33aFixture(project:Project,actions:NormativeOriginInput["actions"]=[],incidences=[0]){
  const origin="TEST_ONLY_NOT_NORMATIVE" as const;
  const source=(standard:string,edition:string):NormativeSource=>({standard,edition,errata:standard.endsWith("6123")?"2025-not-verified":"TEST_ONLY_NOT_NORMATIVE",
    item:"TEST_ONLY_NOT_NORMATIVE — synthetic row, not an ABNT table",domain:"TEST_ONLY_NOT_NORMATIVE — rectangular generated roof, exact test openings and slope",
    transcriber:"TEST_ONLY_NOT_NORMATIVE",documentSha256:"0".repeat(64)});
  const ws=source("ABNT NBR 6123","2023-original"),fs=source("ABNT NBR 8681","2025");
  const regions=generatedRoofRegions(project),r=regions.regions[0];
  const input:NormativeOriginInput={
    speed:{schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:40,heightM:Math.max(...generateStructure(project).model!.nodes.map(n=>n.z))/1000,
      heightReference:"model-base-z0",topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
      reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"TEST_ONLY_NOT_NORMATIVE",source:origin,revision:"1",responsible:origin}},
    openings:{enclosure:"enclosed",classification:"test-enclosed",dominantFace:"none",faceAreasM2:[1,1,1,1,0],permeabilityPercent:1,volumeM3:100,source:origin,revision:"1"},
    incidencesDeg:incidences,purposes:["ULS"],use:"synthetic-rectangular-roof",windFactorClass:"WIND",actions,
  };
  const wind:NormativeWindData={schema_version:"jpn.normative-wind-data/1",revision:origin,origin,rows:incidences.map((incidenceDeg,i)=>({id:`R${i}`,source:ws as NormativeWindData["rows"][number]["source"],
    domain:{typology:project.planning!.typology as "mono"|"gable",fall:project.roof.fall,slopeDeg:Math.atan(Math.abs(r.plane.dzDx||r.plane.dzDy))*180/Math.PI,
      incidenceDeg,widthM:[1,100],lengthM:[1,100],heightM:[0,100],openings:{enclosure:"enclosed",classification:"test-enclosed",dominantFace:"none",faceAreasM2:[1,1,1,1,0],permeabilityPercent:1,volumeM3:100},selectionRule:"exact-row-no-interpolation"},
    zones:regions.regions.flatMap((_,j)=>[
      {id:`Z${j}E`,region:j+1,kind:"edge" as const,boundsFraction:[0,0,.25,1] as [number,number,number,number],cpe:{value:i===0?.8:-.4,source:ws}},
      {id:`Z${j}I`,region:j+1,kind:"interior" as const,boundsFraction:[.25,0,1,1] as [number,number,number,number],cpe:{value:i===0?.2:-.6,source:ws}},
    ]) as NormativeWindData["rows"][number]["zones"],
    cpiCases:[{id:"P",coefficient:{value:.1,source:ws}},{id:"S",coefficient:{value:-.1,source:ws}}] as NormativeWindData["rows"][number]["cpiCases"],
  }))};
  const factors:NormativeFactorsData={schema_version:"jpn.normative-factors-data/1",revision:origin,origin,use:input.use,source:fs as NormativeFactorsData["source"],
    recipes:[{id:"ULS_TEST",purpose:"ULS",source:fs as NormativeFactorsData["source"],leading:"each-variable",leadingEffect:"unfavorable",includePermanentOnly:false}],factors:[]};
  for(const action of [...actions,{factorClass:"WIND",category:"wind" as const}])for(const role of action.category==="permanent"?["permanent"] as const:["leading","accompanying","absent"] as const){
    for(const effect of ["favorable","unfavorable"] as const){
      factors.factors.push({factorClass:action.factorClass,category:action.category,role,effect,purpose:"ULS",
        gamma:{value:role==="absent"?0:effect==="favorable"?.5:2,source:fs} as NormativeFactorsData["factors"][number]["gamma"],
        psi:{value:role==="accompanying"?.5:1,source:fs} as NormativeFactorsData["factors"][number]["psi"]});
    }
  }
  const files:NormativeFiles={wind,factors};return {input,files,wind,factors};
}
