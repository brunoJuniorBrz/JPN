import type {Project} from "./models";
import type {ResistanceReport} from "./resistance-report";
import {elasticLtbStudySchema,type ElasticLtbStudy} from "./elastic-ltb-contracts";
import {sectionAnalysisRequestSchema,sectionAnalysisResultSchema} from "./section-analysis";
import {structureSignature} from "./calculations/project-basis";
import {mixedInputHash} from "./mixed-analysis";
import {resolvePhysicalStructure} from "./physical-structure";
import {reviewPhysicalRestraints} from "./physical-restraints";
import {comparePhysicalProperty} from "./property-precision";

const requireDomain=(condition:unknown,message:string)=>{if(!condition)throw Error("LTB_BLOCKED: "+message);};
// Roundoff admission only. Does not erase a declared load, spring or eccentricity.
const zero=(v:number,scale:number)=>Math.abs(v)<=128*Number.EPSILON*Math.max(1,scale);
const identity=[[1,0,0],[0,1,0],[0,0,1]];
export const elasticLtbReference={
  title:"Rui Simões, Design of Members, JRC workshop, Brussels 16–17 October 2014; PDF p22, standard uniform-moment case",
  url:"https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/05_Eurocodes_Steel_Workshop_SIMOES.pdf",
  formula:"Mcr = (pi/L) sqrt(E Iweak (G J + E Iw (pi/L)^2))",
  classification:"classical elastic bifurcation; not ABNT design resistance",
};

/** Classical fork/fork, free-warping, uniform moment reference in SI.
 * No Cb fit, reduction factor, gamma or design resistance is introduced. */
export function uniformMomentElasticCritical(p:{lengthM:number;ePa:number;gPa:number;iWeakM4:number;jM4:number;iwM6:number}){
  requireDomain(Object.values(p).every(v=>Number.isFinite(v)&&v>0),"Positive finite L/E/G/Iweak/J/Iw required");
  const k=Math.PI/p.lengthM,m=k*Math.sqrt(p.ePa*p.iWeakM4*(p.gPa*p.jM4+p.ePa*p.iwM6*k*k));
  requireDomain(Number.isFinite(m)&&m>0,"Elastic critical moment outside finite numerical domain");return m;
}

/** Prepare only an admitted physical model. Restriction to the independently
 * tested +X/roll=0 native frame is intentional until C1 axes are integrated. */
export async function prepareElasticLtb(project:Project,base:ResistanceReport,input:ElasticLtbStudy){
  const study=elasticLtbStudySchema.parse(input),draft=project.workspace.spatialPreparation!;
  const {reportSha256,...body}=base;
  requireDomain(await mixedInputHash(body)===reportSha256,"Resistance report changed");
  requireDomain(base.binding.project.id===project.id&&base.binding.preparationSha256===await mixedInputHash({geometry:structureSignature(project),preparation:draft}),"Stale project/declaration/analysis");
  requireDomain(draft.elasticLtbStudies?.some(s=>JSON.stringify(s)===JSON.stringify(study)),"Study absent from current declaration");
  requireDomain(study.endWarping.every(v=>v==="free"),"Both ends require an explicit free-warping physical basis; 6 DOF supports do not establish it");
  requireDomain(study.loadHeightFromShearCenterM===0&&study.momentPattern==="uniform-end-couples","Only pure uniform end couples, zero load height; no eccentric/transverse loading");
  const piece=base.pieces.find(p=>p.pieceId===study.pieceId),d=piece?.declaration,g=piece?.physicalProperties;
  requireDomain(piece&&d&&g,"Missing physical member/material/resistance declaration");
  if(!piece||!d||!g)throw Error("LTB_BLOCKED: missing physical declaration");
  requireDomain(!piece.dataIssues.length,"Physical declarations incomplete: "+piece.dataIssues.join("; "));
  requireDomain((d.family==="rolled"||d.family==="welded")&&d.geometry?.shape==="i","Only declared rolled/welded doubly symmetric I geometry");
  requireDomain(g.rotationDeg===0,"C1 pending: only roll=0 supported");
  const model=resolvePhysicalStructure(project).model!,physical=model.pieces.find(p=>p.id===study.pieceId)!;
  const a=model.nodes.find(n=>n.id===physical.start)!,b=model.nodes.find(n=>n.id===physical.end)!;
  requireDomain(b.x>a.x&&b.y===a.y&&b.z===a.z,"C1 pending: only global +X orientation supported");
  const mapped=base.demands.pieces.find(p=>p.pieceId===study.pieceId)!;
  requireDomain(mapped.kind==="frame"&&mapped.segments.length===1,"One whole prismatic frame member; no segmented/continuous-span shortening");
  requireDomain(d.lateralRestraintM===mapped.lengthM,"Declared lateral unbraced length must match the whole physical member, without automatic shortening");
  requireDomain(!model.pieces.some(p=>p.id!==physical.id&&[p.start,p.end].some(n=>n===a.id||n===b.id)),"Isolated fork span required; adjacent-member restraint not inferred");
  const member=base.physicalInput.members.find(m=>m.id===mapped.segments[0].id)!;
  requireDomain(member.kind==="frame"&&[...member.release_start,...member.release_end].every(v=>!v),"End couples require connected frame ends with no released member DOFs");
  requireDomain(reviewPhysicalRestraints(project,draft).length===0,"Physical restraint review failed");
  const restraints=draft.physicalRestraints?.items.filter(r=>r.pieceId===physical.id)??[];
  requireDomain(restraints.length===6&&restraints.every(r=>r.binding.kind==="support"&&(r.nodeId===a.id||r.nodeId===b.id)),"Six explicit endpoint fixed-DOF bindings required; finite/intermediate restraints unsupported");
  for(const [index,node] of [a,b].entries()){
    const support=draft.supports.find(s=>s.nodeId===node.id),position=index*mapped.lengthM;
    requireDomain(support&&support.dofs.join(",")===(index===0?"fixed,fixed,fixed,fixed,free,free":"free,fixed,fixed,fixed,free,free"),"Explicit fork/fork with axial datum only at start and bending rotations free");
    for(const [kind,direction]of [["lateral",[0,1,0]],["lateral",[0,0,1]],["torsional",[1,0,0]]] as const)
      requireDomain(restraints.some(r=>r.nodeId===node.id&&r.positionM===position&&r.kind===kind&&r.directionGlobal.every((v,i)=>v===direction[i])),"Endpoint lateral and torsional restraints must match actual declared axes and position");
  }
  const fields=base.continuousDemands?.pieces.find(p=>p.pieceId===study.pieceId)?.fields.filter(f=>f.combinationId===study.combinationId);
  requireDomain(fields?.length===1,"Actual continuous actions for the selected combination required");
  const field=fields![0],poly=field.forcePolynomials.myNm!,moment=poly[0];
  requireDomain(field.globalToLocal.every((row,i)=>row.every((v,j)=>zero(v-identity[i][j],1))),"Native axes do not match supported principal frame");
  // Reject source loads even if their sum cancels. Zero factors are inactive.
  const combination=base.physicalInput.combinations.find(c=>c.id===study.combinationId)!;
  requireDomain(combination,"Missing combination");
  const active=(caseId:string)=>(combination.factors[caseId]??0)!==0;
  requireDomain(draft.loads.filter(l=>active(l.caseId)).every(l=>[a.id,b.id].includes(l.nodeId)&&[l.fxKn,l.fyKn,l.fzKn,l.mxKnm,l.mzKnm].every(v=>v===0)),"Only declared end My couples may be active");
  requireDomain(!(draft.loading?.selfWeight&&active(draft.loading.selfWeight.caseId))&&!("member_loads"in base.physicalInput&&base.physicalInput.member_loads.some(l=>active(l.case))),"Distributed/self-weight loads outside uniform-couple domain");
  requireDomain(moment!==0&&poly.slice(1).every(v=>zero(v,Math.abs(moment)))&&field.loadLocalNM.every(v=>v===0),"Continuous moment must be constant, nonzero and unloaded");
  for(const key of ["nN","vyN","vzN","tNm","mzNm"] as const)
    requireDomain(field.forcePolynomials[key]?.every(v=>zero(v,Math.abs(moment))),"Concurrent axial/shear/weak bending/torsion outside pure-bending domain");
  const dims=d.geometry!.dimensionsMm;
  const sectionRequest=sectionAnalysisRequestSchema.parse({schema_version:"jpn.section-analysis/1",units:"mm",geometry:{shape:"i",height:dims.height,width:dims.width,webThickness:dims.webThickness,flangeThickness:dims.flangeThickness,insideRadius:dims.insideRadius},poisson:g.nu,source:d.geometry!.source,revision:d.geometry!.revision,responsible:study.responsible,convergence:.001});
  return {study,sectionRequest,sectionRequestSha256:await mixedInputHash(sectionRequest),lengthM:mapped.lengthM,momentNm:moment,field,piece,baseReportSha256:base.reportSha256,analysisInputSha256:base.binding.inputSha256,analysisResultSha256:base.binding.resultSha256};
}
export type PreparedElasticLtb=Awaited<ReturnType<typeof prepareElasticLtb>>;

/** Only server-computed geometric properties admitted against actual FE values.
 * Even a below-critical diagnostic leaves every normative mode pending. */
export async function evaluateElasticLtb(prepared:PreparedElasticLtb,value:unknown){
  const result=sectionAnalysisResultSchema.parse(value),p=result.properties,g=prepared.piece.physicalProperties,d=prepared.piece.declaration!;
  requireDomain(result.input_sha256===prepared.sectionRequestSha256&&result.convergence.status==="observed"&&result.convergence.target===prepared.sectionRequest.convergence,"Section result mismatch or unobserved refinement");
  const properties={areaCm2:p.areaMm2/100,iyCm4:p.iyMm4/1e4,izCm4:p.izMm4/1e4,jCm4:p.jMm4/1e4,wyCm3:Math.min(p.wyPositiveMm3,p.wyNegativeMm3)/1000,wzCm3:Math.min(p.wzPositiveMm3,p.wzNegativeMm3)/1000};
  for(const [key,v]of Object.entries(properties)){
    const actual=key in g?g[key as "areaCm2"]:d.sectionProperties[key];
    requireDomain(typeof actual==="number"&&comparePhysicalProperty(v,actual,d.sectionPropertyResolutions?.[key]).status==="consistent","Computed section differs from actual FE/resistance property "+key);
    // Caller cannot widen property resolutions to admit another section.
    const reported=Number(v.toPrecision(6)),resolution=10**(Math.floor(Math.log10(v))-5);
    requireDomain(typeof actual==="number"&&comparePhysicalProperty(reported,actual,resolution).status==="consistent","Property exceeds native six-significant-figure reporting interval: "+key);
  }
  requireDomain(p.iyMm4>p.izMm4&&p.warpingMm6>0,"Strong local-y bending and positive warping stiffness required");
  const dimensions=prepared.sectionRequest.geometry;
  requireDomain(dimensions.shape==="i","I geometry required");
  // Symmetry is imposed by the geometric I constructor, not guessed from this
  // tolerance. These checks only detect a broken native coordinate/property map.
  requireDomain(zero(p.iyzMm4,Math.sqrt(p.iyMm4*p.izMm4)),"Native I geometry lost principal symmetry");
  const si={lengthM:prepared.lengthM,ePa:g.eGpa!*1e9,gPa:g.gGpa!*1e9,iWeakM4:p.izMm4*1e-12,jM4:p.jMm4*1e-12,iwM6:p.warpingMm6*1e-18};
  const criticalMomentNm=uniformMomentElasticCritical(si),ratio=Math.abs(prepared.momentNm)/criticalMomentNm,elasticYieldMomentNm=d.fyMpa!*Math.min(p.wyPositiveMm3,p.wyNegativeMm3)/1000;
  const elasticRange=criticalMomentNm<elasticYieldMomentNm;
  const body={schema_version:"jpn.elastic-ltb-result/1" as const,study:prepared.study,
    status:elasticRange?(ratio>=1?"ELASTIC_INSTABILITY_INDICATED" as const:"BELOW_ELASTIC_CRITICAL_CONDITIONAL" as const):"YIELD_PRECEDES_ELASTIC_BIFURCATION" as const,
    reference:elasticLtbReference,inputsSI:si,criticalMomentNm,momentNm:prepared.momentNm,elasticCriticalRatio:ratio,elasticYieldMomentNm,elasticRange,
    governing:{pieceId:prepared.study.pieceId,combinationId:prepared.study.combinationId,segmentId:prepared.field.segmentId,positionM:0,coverage:"constant-on-whole-original-member"},
    binding:{baseReportSha256:prepared.baseReportSha256,analysisInputSha256:prepared.analysisInputSha256,analysisResultSha256:prepared.analysisResultSha256,studySha256:await mixedInputHash(prepared.study),sectionInputSha256:result.input_sha256,sectionResultSha256:await mixedInputHash(result)},
    sectionCalculation:result,restraintModel:"existing fixed endpoint DOFs; explicit free warping; no intermediate restraint or inferred roof stiffness",
    designResistance:null,normativeResistanceVerified:false as const,allMemberLimitStatesVerified:false as const,
    computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const,
    limitations:["Perfect straight prismatic doubly symmetric I; elastic bifurcation only. No ABNT reduction curve or member resistance verification.","No local/distortional buckling, residual stress, imperfections, finite braces, load-height effects, nonuniform moments or P-delta.","Free warping is a sourced physical declaration; the 6 DOF linear solver does not verify it. Brace/support capacities and existing construction remain unverified.","Mcr and My are references, never design resistances. Below Mcr is conditional and does not approve the member."]};
  return {...body,resultSha256:await mixedInputHash(body)};
}
export type ElasticLtbResult=Awaited<ReturnType<typeof evaluateElasticLtb>>;
export type ElasticLtbAttempt={study:ElasticLtbStudy;status:"BLOCKED";reason:string;designResistance:null}|{study:ElasticLtbStudy;status:"CALCULATED_ELASTIC_REFERENCE";result:ElasticLtbResult};
