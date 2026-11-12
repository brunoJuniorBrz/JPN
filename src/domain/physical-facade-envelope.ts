import type {PhysicalGeometry} from "./structure";
import {inspectPhysicalFacades} from "./physical-facades";
import {intersectionArea} from "./physical-roof-coverage";
type V2=[number,number];
type V3=[number,number,number];
function fail(code:string,message:string):never{throw Error(code+": "+message);}
function commonPlaneProject(normal:string,p:V3):V2{
  return normal.endsWith("X")?[p[1],p[2]]:[p[0],p[2]];
}
/** Explicit site-surface audit only. This is NOT the enclosed-air-volume
 * determination, pressure coefficient selection or load path for wind. */
export function auditPhysicalFacadeEnvelope(raw:unknown,structure?:PhysicalGeometry|null){
  const measured=inspectPhysicalFacades(raw,structure);
  const faces=measured.geometry.facades;
  const totalVertices=faces.reduce((s,f)=>
    s+f.outer.length+f.openings.reduce((t,h)=>t+h.length,0),0);
  if(totalVertices>650)
    fail("FACADE_AUDIT_COMPLEXITY","mais de 650 vértices: divida a medição física em outra revisão");
  const global=faces.map(f=>({
    outer:f.outer.map(p=>commonPlaneProject(f.outward,p)),
    holes:f.openings.map(h=>h.map(p=>commonPlaneProject(f.outward,p))),
  }));
  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
    const a=faces[i],b=faces[j],
      axisA=a.outward.endsWith("X")?0:1,
      axisB=b.outward.endsWith("X")?0:1;
    if(axisA!==axisB||Math.abs(a.outer[0][axisA]-b.outer[0][axisB])>0.01)
      continue;
    const overlapMm2=intersectionArea(global[i],global[j]),
      threshold=Math.max(1e-3,1e-10*Math.min(measured.faces[i].verticalAreaM2,measured.faces[j].verticalAreaM2)*1e6);
    if(overlapMm2>threshold)
      fail("FACADE_SHEET_OVERLAP",a.id+" e "+b.id+" representam áreas de fachada duplicadas");
  }
  const statuses=faces.map(f=>({
    facadeId:f.id,enclosure:f.enclosure,
    openingAreaM2:measured.faces.find(x=>x.id===f.id)!.openingAreaM2,
    needsSiteReview:f.enclosure==="unknown"||f.enclosure==="partially-cladded"||
      f.enclosure==="open"||f.openings.length>0,
  }));
  const missingEvidence=statuses.filter(s=>s.needsSiteReview).map(s=>s.facadeId);
  const totalOpeningAreaM2=statuses.reduce((s,x)=>s+x.openingAreaM2,0);
  const grossDeclaredAreaM2=measured.totalVerticalAreaM2+totalOpeningAreaM2;
  if(!Number.isFinite(grossDeclaredAreaM2)||grossDeclaredAreaM2<=0)
    fail("FACADE_GROSS_AREA","área bruta não física");
  return {
    ...measured,
    schema_version:"jpn.physical-facade-envelope/1" as const,
    globalOverlapReviewed:true as const,
    surfaceCoverage:"declared-facades-only" as const,
    globalEnclosureState:"not-established" as const,
    pressureScenarioStatus:"requires-normative-review" as const,
    declaredGrossVerticalAreaM2:grossDeclaredAreaM2,
    declaredOpeningsAreaM2:totalOpeningAreaM2,
    facesRequiringExplicitEnclosureReview:missingEvidence,
    facadeStatuses:statuses,
    windReady:false as const,facadeLoadPathReady:false as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,
    limitations:[
      "O conjunto de fachadas declaradas não demonstra que o perímetro e o volume total da edificação estejam completos.",
      "Aberturas e superfícies sem revestimento não são convertidas automaticamente em Cp, Cpi ou coeficientes normativos.",
      "Não há verificação das chapas, fixações, travessas, contraventamentos, paredes existentes e fundações.",
    ],
  };
}
