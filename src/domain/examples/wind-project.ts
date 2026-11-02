import { roofAreaReferenceProject } from "./roof-area-project";
import { generatedRoofRegions } from "../roof-load-path";
import { structureSignature } from "../calculations/project-basis";
import { compileEngineeringCombinations, type EngineeringCombinations } from "../engineering-combinations";
import { selfWeightOverlapReviewBasis } from "../structural-loading";
import type { WindDeclaration } from "../wind-contracts";

export const syntheticWindReference = {
  standard:"Ensaio matemático sintético — não ABNT",edition:"M22-R1",clause:"Definição explícita do controle, sem cláusula normativa aplicada",
  source:"Controle independente de pressões zonais; não usar em obra",revision:"1",responsible:"Autor do ensaio sintético",
};
/** Full physical example remains separate from the current user's project. */
export function windReferenceProject() {
  const p = roofAreaReferenceProject(), d = p.workspace.spatialPreparation!, ref = syntheticWindReference;
  p.name = "EXEMPLO SINTÉTICO — VENTO ZONAL";
  const regions = generatedRoofRegions(p).regions;
  const cases = ["WP","WS"].map((id,index) => ({id,incidenceDeg:index*180,dynamicPressurePa:500,reference:ref,
    zones:regions.flatMap(r => {
      const [x0,y0,x1,y1] = r.boundsM, mid = (x0+x1)/2;
      return [[x0,y0,mid,y1],[mid,y0,x1,y1]].map((boundsM,j) => ({id:`${r.id}-Z${j+1}`,regionId:r.id,
        boundsM:boundsM as [number,number,number,number],kind:j===0?"edge" as const:"interior" as const,
        externalCoefficient:index ? -(j===0?.8:.2) : (j===0?.8:.2),internalCoefficient:0,reference:ref}));
    }),
  }));
  const wind: WindDeclaration = {schema_version:"jpn.wind-roof/1",normativeValidation:"pending-engineer-review",
    geometrySignature:structureSignature(p),scope:"global-roof-only",transmission:"simply-supported-sheeting-to-parallel-purlins",
    building:{location:"Local fictício, sem isopleta",basicVelocityMS:30,velocityReference:ref,
      terrain:"Sintético",roughness:"Sintética",topography:"Sintética",factorsDescription:"q=500 Pa fornecido diretamente; velocidade não usada para gerar q",
      enclosure:"enclosed",openingsDescription:"Volume fechado único hipotético, aberturas não dominantes",
      internalPressureDescription:"cpi=0 explicitamente declarado neste ensaio",staticApplicability:"Ensaio estático linear, sem validação de aplicabilidade normativa",loadPath:"Telhamento biapoiado entre terças → pórticos de terça → juntas físicas → apoios declarados",reference:ref},cases};
  d.cases = [...d.cases,...cases.map(c => ({id:c.id,source:ref.source}))];
  d.loading!.wind = wind;
  const combinations: EngineeringCombinations = {schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",
    actions:d.cases.map(c=>({caseId:c.id,category:c.id==="AREA"?"permanent":"wind",exclusiveGroup:c.id==="AREA"?null:"WIND",reference:ref})),
    combinations:["WP","WS","DOUBLE","SUM"].map(id=>({id,purpose:"SLS-characteristic",hypothesis:"Ensaio de sinais e superposição; fatores de teste, sem equivalência normativa",reference:ref,
      terms:d.cases.map(c=>({caseId:c.id,gamma:id==="DOUBLE"&&c.id==="WP"?2:(c.id===id||id==="SUM"&&(c.id==="AREA"||c.id==="WP"))?1:0,psi:1,reference:ref}))})),
  };
  d.engineeringCombinations = combinations;
  d.combinations = compileEngineeringCombinations(combinations,d.cases.map(c=>c.id)).combinations;
  d.loading!.overlapReview={confirmed:true,source:"Ensaio: AREA é carga vertical permanente sintética independente do vento",revision:"1",basis:selfWeightOverlapReviewBasis(d,d.loading!)};
  return p;
}
