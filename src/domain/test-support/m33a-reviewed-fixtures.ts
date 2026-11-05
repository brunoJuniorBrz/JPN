/** Geometry, supports and action magnitudes below are SYNTHETIC controls, not a real building. */
import { windReferenceProject } from "../examples/wind-project";
import { generateStructure } from "../calculations/structure";
import { structureSignature } from "../calculations/project-basis";
import { inspectConnectivity } from "../spatial-connectivity";
import type { NormativeOriginInput } from "../normative-origin";
import { correctedWindDocumentSha256,combinationsDocumentSha256,type ReviewedExtract } from "../reviewed-roof-catalog";

export function reviewedRoofProject(typology:"mono"|"gable"){
  const p=windReferenceProject(),d=p.workspace.spatialPreparation!;
  Object.assign(p.roof,{widthM:6,lengthM:6,lowHeightM:3,slopePercent:typology==="gable"?100:100/Math.sqrt(3),fall:"width-positive",supports:[]});
  Object.assign(p.planning!,{typology,frameSpacingM:2,purlinSpacingM:1.5,panels:4,overhangStartM:0,overhangEndM:0});
  const model=generateStructure(p).model!;
  d.geometrySignature=structureSignature(p);
  d.supports=model.nodes.filter(n=>n.z===0).map(n=>({nodeId:n.id,dofs:["fixed","fixed","fixed","fixed","fixed","fixed"]}));
  d.connectivity={version:1,geometrySignature:d.geometrySignature,reviewSource:"SYNTHETIC explicit connected joints",
    junctions:inspectConnectivity(model).junctions.map(j=>({nodeId:j.nodeId,pieceIds:j.pieceIds,decision:"connect"}))};
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const diagonals=model.pieces.filter(piece=>piece.role==="web"&&Math.abs(nodes.get(piece.start)!.x-nodes.get(piece.end)!.x)>1e-6);
  d.memberKinds=diagonals.map(piece=>({pieceId:piece.id,kind:"axial"}));
  d.memberConnections=diagonals.map(piece=>({pieceId:piece.id,start:"axial",end:"axial"}));
  d.loadPathReview="SYNTHETIC: declared area actions and roof wind through parallel purlins, connected frame/axial structure and actual fixed column bases. No physical building approval.";
  d.cases=[{id:"G",source:"SYNTHETIC independent roof cladding"},{id:"Q",source:"SYNTHETIC roof use magnitude"}];
  d.loads=[];d.combinations=[];d.engineeringCombinations=undefined;
  d.loading!.wind=undefined;d.loading!.selfWeight=null;d.loading!.uniform=[];d.loading!.overlapReview=undefined;
  d.loading!.roofDistribution!.geometrySignature=d.geometrySignature;
  d.loading!.roofArea=[{caseId:"G",knM2:.1,projection:"roof-surface",direction:[0,0,-1],source:"SYNTHETIC declared cladding only",revision:"1",loadPath:d.loadPathReview},
    {caseId:"Q",knM2:.25,projection:"horizontal",direction:[0,0,-1],source:"SYNTHETIC declared use magnitude",revision:"1",loadPath:d.loadPathReview}];
  const maxHeight=Math.max(...model.nodes.map(n=>n.z))/1000,rise=maxHeight-3;
  const input:NormativeOriginInput={speed:{schema_version:"jpn.wind-speed/1",edition:"2023-original",v0Mps:40,heightM:maxHeight,heightReference:"model-base-z0",
    topography:"flat-or-gently-undulating",roughnessTransition:"none",category:"II",sizeClass:"A",s3:1,
    reference:{standard:"ABNT NBR 6123",edition:"2023",clause:"Declared synthetic site, not isopleth selection",source:"SYNTHETIC V0",revision:"1",responsible:"Validation"}},
    openings:{enclosure:"enclosed",classification:"airtight-fixed-windows",dominantFace:"none",faceAreasM2:[0,0,0,0,0],permeabilityPercent:0,volumeM3:36*(3+rise/2),source:"SYNTHETIC airtight envelope",revision:"1"},
    reviewedRoof:{procedure:"6123-global-Ce-airtight/1",axes:"b=+X;a=+Y;alpha0=+Y;alpha90=+X;alpha270=-X",roofImpermeable:true,effectivelyAirtight:true,fixedWindows:true,
      negligibleAccidentalWindowBreakage:true,singleInternalPressure:true,noRoofProjections:true,noLanterns:true,noSeparateCeilingPressure:true,
      noNeighborAmplification:true,staticPeriodAtMostOneSecond:true,s3Group:3,source:"SYNTHETIC applicability assumptions; engineer review pending",revision:"1"},
    incidencesDeg:typology==="gable"?[0,90]:[90,270],purposes:["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"],
    use:"roof-primary-8681-2025-individual",windFactorClass:"WIND",actions:[{caseId:"G",category:"permanent",exclusiveGroup:null,factorClass:"INDUSTRIALIZED_ROOF"},{caseId:"Q",category:"variable",exclusiveGroup:null,factorClass:"ROOF_LIVE"}]};
  return {project:p,input};
}

/** Deliberately invented values exercise recipes; never an ABNT transcription. */
export function syntheticReviewedExtract():ReviewedExtract{return {
  schema_version:"jpn.owner-normative-extract/1",origin:"TEST_ONLY_NOT_NORMATIVE",revision:"TEST_ONLY_NOT_NORMATIVE",transcriber:"TEST_ONLY_NOT_NORMATIVE",
  windDocumentSha256:correctedWindDocumentSha256,combinationsDocumentSha256:combinationsDocumentSha256,
  gable45:{crossWindward:.41,crossLeeward:-.52,parallelLeading:-.73,parallelRemainder:-.64},
  mono30:{positiveHigh:-.47,positiveLow:-.53,negativeHigh:.09,negativeLow:-.61},airtightCpi:[-.17,.03],s3Group3:1,
  factors:{permanentSteel:1.2,permanentIndustrialized:1.3,permanentFavorable:.9,wind:1.7,roofLive:1.9,psiWind:[.11,.22,0],psiRoofLive:[.44,.55,.66]},
};}
