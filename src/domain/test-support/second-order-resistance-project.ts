import ue4 from "./ue4-section-reference.json" with {type:"json"};
import {m50Project} from "./m50-project";
import {reviewM34Fixture} from "./m34ab-fixtures";
import {structureSignature} from "../calculations/project-basis";
import {declareLocalAxes} from "../local-axes-review";

/** Explicit compressed cantilever, 30% of Euler weak-axis critical load. Not a
 * normative action or a claim about buckling lengths of a real construction. */
export function secondOrderResistanceProject(steel=false){
  const p=m50Project(),d=p.workspace.spatialPreparation!;
  p.workspace.physicalStructure={schema_version:"jpn.declared-structure/1",units:"mm",source:"declared",provenance:"Independent compressed cantilever",revision:"TEST-1",
    nodes:[{id:"A",x:0,y:0,z:0},{id:"B",x:0,y:0,z:1000}],pieces:[{id:"V0",role:"column",start:"A",end:"B"}]};
  d.physicalCatalog!.assignments=[{pieceId:"V0",materialId:"STEEL",sectionId:"UE",rotationDeg:0}];
  const section=d.physicalCatalog!.sections.find(s=>s.id==="UE")!,decl=d.resistance![0];
  if(!steel){
    const q=ue4.properties;
    section.areaCm2=q.areaMm2/100;section.iyCm4=q.iyMm4/10000;section.izCm4=q.izMm4/10000;section.jCm4=q.jMm4/10000;
    decl.geometry!.dimensionsMm={...ue4.geometry};
    decl.sectionProperties={wyCm3:Math.min(q.wyPositiveMm3,q.wyNegativeMm3)/1000,wzCm3:Math.min(q.wzPositiveMm3,q.wzNegativeMm3)/1000};
    decl.sectionPropertyResolutions={areaCm2:1e-8,iyCm4:1e-8,izCm4:1e-8,jCm4:1e-8,wyCm3:1e-8,wzCm3:1e-8};
  }
  if(steel){
    const h=.2,b=.1,tw=.006,tf=.01;
    section.areaCm2=(2*b*tf+(h-2*tf)*tw)*1e4;
    section.iyCm4=(b*h**3-(b-tw)*(h-2*tf)**3)/12*1e8;
    section.izCm4=(2*tf*b**3+(h-2*tf)*tw**3)/12*1e8;
    section.jCm4=(2*b*tf**3+(h-2*tf)*tw**3)/3*1e8;
    decl.family="welded";decl.geometry={version:1,basis:"physical-engineer-declaration",shape:"i",dimensionsMm:{height:200,width:100,webThickness:6,flangeThickness:10},source:"Analytic I section",revision:"TEST-1"};
    decl.sectionProperties={wyCm3:section.iyCm4*1e-8/(h/2)*1e6,wzCm3:section.izCm4*1e-8/(b/2)*1e6};
    decl.sectionPropertyResolutions={};d.resistanceStandards=[{pieceId:"V0",standard:"NBR8800"}];
  }
  decl.bucklingYM=1;decl.bucklingZM=1;decl.lateralRestraintM=1;
  d.memberKinds=[{pieceId:"V0",kind:"frame"}];d.memberConnections=[{pieceId:"V0",start:"rigid",end:"rigid"}];
  d.supports=[{nodeId:"A",dofs:["fixed","fixed","fixed","fixed","fixed","fixed"]}];
  d.physicalRoofFaces=undefined;d.physicalFacades=undefined;d.roofRegions=undefined;d.supportInterfaces=undefined;d.physicalRestraints=undefined;d.elasticLtbStudies=undefined;d.memberDesign=undefined;d.connections=undefined;
  const compression=.3*Math.PI**2*200e9*section.izCm4!*1e-8/(4*1**2);
  d.cases=[{id:"P",source:"Synthetic mechanics test: compression and explicit global Y force"}];
  d.loads=[{id:"50505050-5050-4050-8050-505050505050",caseId:"P",nodeId:"B",fxKn:0,fyKn:steel?4:.6,fzKn:-compression/1000,mxKnm:0,myKnm:0,mzKnm:0}];
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[]};
  d.combinations=[{id:"ULS",factors:{P:1}}];
  const reference={...d.engineeringCombinations!.actions[0].reference,source:"Synthetic unity-factor mechanics comparison, not normative factors"};
  d.engineeringCombinations={schema_version:"jpn.engineering-combinations/1",normativeValidation:"pending-engineer-review",actions:[{caseId:"P",category:"variable",exclusiveGroup:null,reference}],
    combinations:[{id:"ULS",purpose:"ULS",hypothesis:"Independent mechanics test",reference,terms:[{caseId:"P",gamma:1,psi:1,reference}]}]};
  reviewM34Fixture(p);
  return declareLocalAxes(p,structureSignature(p),[{pieceId:"V0",rotationDeg:0,source:"Explicit Z-up reference for this cantilever",revision:"TEST-1"}]);
}
