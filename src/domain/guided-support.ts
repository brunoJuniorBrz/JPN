import { z } from "zod";
import type { Project } from "./models";
import { emptyPlanning } from "./structure";

/** Esboço construtivo informado pelo usuário. Não é declaração de apoios de cálculo. */
export const guidedSupportSchema=z.object({
 version:z.literal(1),
 arrangement:z.enum(["steel","masonry","mixed","attached"]),
 left:z.enum(["new-column","existing-masonry","existing-concrete","unknown"]),
 right:z.enum(["new-column","existing-masonry","existing-concrete","unknown"]),
 coverage:z.enum(["whole","partial"]),
 source:z.string().trim().min(1).max(500),
 note:z.string().max(1200),
}).strict();
export type GuidedSupport=z.infer<typeof guidedSupportSchema>;
export type GuidedArrangement=GuidedSupport["arrangement"];
export const guidedArrangements:Record<GuidedArrangement,{title:string;description:string;left:GuidedSupport["left"];right:GuidedSupport["right"];coverage:GuidedSupport["coverage"]}>={
 steel:{title:"Estrutura metálica nova",description:"Pilares metálicos dos dois lados (somente esboço).",left:"new-column",right:"new-column",coverage:"whole"},
 masonry:{title:"Sobre paredes existentes",description:"A cobertura será apoiada na construção existente.",left:"existing-masonry",right:"existing-masonry",coverage:"whole"},
 mixed:{title:"Mista: parede e pilares",description:"Combina apoio na construção e pilares novos.",left:"existing-masonry",right:"new-column",coverage:"whole"},
 attached:{title:"Cobertura parcial / encostada",description:"Uma parte da cobertura apoia em construção existente.",left:"existing-masonry",right:"new-column",coverage:"partial"},
};
export function guidedPreset(arrangement:GuidedArrangement):GuidedSupport{
 const p=guidedArrangements[arrangement];
 return {version:1,arrangement,left:p.left,right:p.right,coverage:p.coverage,source:"Escolha visual do responsável pela obra; não verificada em campo.",note:""};
}
export function isParametricSupportAllowed(project:Pick<Project,"workspace">){
 const c=project.workspace.guidedSupport;
 return !c || (c.coverage==="whole"&&c.left==="new-column"&&c.right==="new-column");
}
export function guidedSupportIssue(project:Pick<Project,"workspace">):string|null{
 const c=project.workspace.guidedSupport;
 if(!c||isParametricSupportAllowed(project))return null;
 if(c.coverage==="partial")return "Cobertura parcial: o gerador retangular não conhece os recortes e a extensão da área construída. Declare os nós, barras e o contorno reais.";
 return "Apoios existentes em alvenaria ou concreto, ou configuração mista: o gerador automático de dois pilares por tesoura não corresponde à obra. Declare os nós e apoios reais antes de analisar.";
}
/** Sugestão SOMENTE de malha de desenho, não de espaçamentos ou perfis dimensionados. */
export function applyGuidedSketch(project:Project,options:{
 widthM:number|null;lengthM:number|null;lowHeightM:number|null;slopePercent:number|null;
 typology:"mono"|"gable";frameSpacingM:number|null;purlinSpacingM:number|null;trussDepthM:number|null;panels:number|null;
 support:GuidedSupport
}):Pick<Project,"roof"|"planning"|"workspace">{
 const support=guidedSupportSchema.parse(options.support);
 const planning=project.planning??emptyPlanning();
 return {
  roof:{...project.roof,widthM:options.widthM,lengthM:options.lengthM,lowHeightM:options.lowHeightM,slopePercent:options.slopePercent,revision:project.roof.revision+1},
  planning:{...planning,typology:options.typology,frameSpacingM:options.frameSpacingM,purlinSpacingM:options.purlinSpacingM,trussDepthM:options.trussDepthM,panels:options.panels},
  workspace:{...project.workspace,guidedSupport:support},
 };
}
