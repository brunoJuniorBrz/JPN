import type {PhysicalGeometry,StructureModel,PieceRole} from "./structure";
import {emptyProfile} from "./structure";
import {visualProfileFromDesignation} from "./profile-section";
import {mixedStations} from "./mixed-analysis";
import {reviewResultOverlay,type ResultOverlay,type ResultOverlayKind,type OverlayIssue} from "@/components/planning/studio-result-overlay";

/** INT-1f: Studio layers over a /3 (or /2) mixed result. Pure data: nothing here draws, and nothing is shown without
 * `reviewResultOverlay` (hash binding, combination, solver, units, no approval). A picture of results, never an approval. */
const ROLE:Record<string,PieceRole>={beam:"topChord"};
/** Physical geometry (declared structure) as the Studio model: line pieces only, no invented section or roof metrics. */
/** Designação comercial por peça a partir do catálogo físico (pieceId → seção → designação). */
export function catalogDesignations(catalog:{sections:{id:string;designation?:string}[];assignments:{pieceId:string;sectionId:string}[]}|undefined|null){
  if(!catalog)return undefined;
  const bySection=new Map(catalog.sections.map(s=>[s.id,s.designation??""]));
  const byPiece=new Map(catalog.assignments.map(a=>[a.pieceId,bySection.get(a.sectionId)??""]));
  return (pieceId:string)=>byPiece.get(pieceId)||undefined;
}
/** `designationOf` (opcional): designação comercial por peça, usada só para a seção VISUAL no 3D. */
export function studioModelFromPhysical(g:PhysicalGeometry,designationOf?:(pieceId:string)=>string|undefined):StructureModel{
  const profileOf=(id:string)=>{const d=designationOf?.(id);return (d&&visualProfileFromDesignation(d))||emptyProfile();};
  return {units:"mm",nodes:g.nodes.map(n=>({...n})),groups:[],frameCount:0,frameSpacingM:0,purlinRows:0,purlinSpacingM:0,projectedAreaM2:0,roofAreaM2:0,
    totalLengthM:g.pieces.reduce((s,p)=>s+p.lengthMm,0)/1000,knownMassKg:0,massComplete:false,
    pieces:g.pieces.map(p=>({id:p.id,role:(ROLE[p.role]??p.role) as PieceRole,start:p.start,end:p.end,lengthMm:p.lengthMm,profile:profileOf(p.id),massKg:null}))};
}

type Vec=[number,number,number];
export type SolverNode={id:string;x_m:number;y_m:number;z_m:number};
export type SolverMember={id:string;start:string;end:string};
export type MappedMember={id:string;originalId:string;start:string;end:string};
type ResultNodes=Record<string,{translation_m:Vec;reaction_force_n:Vec}>;
type ResultMembers=Record<string,Parameters<typeof mixedStations>[0]>;
/** Scene coordinates (metres, y-up) of the deformed axes: solver z-up -> scene (x, z, -y), like `scenePoint`. */
export type DeformedSegment={a:Vec;b:Vec};
export function deformedSegments(input:{nodes:SolverNode[];members:SolverMember[];translations:Record<string,Vec>;scale:number}):DeformedSegment[]{
  if(!Number.isFinite(input.scale))throw Error("DEFORMED_SCALE: fator de escala inválido");
  const at=new Map(input.nodes.map(n=>[n.id,n])),p=(id:string):Vec=>{
    const n=at.get(id),t=input.translations[id];if(!n||!t)throw Error("DEFORMED_NODE: nó sem resultado "+id);
    const x=n.x_m+input.scale*t[0],y=n.y_m+input.scale*t[1],z=n.z_m+input.scale*t[2];return [x,z,-y];};
  return input.members.map(m=>({a:p(m.start),b:p(m.end)}));
}

export type LayerInput={inputSha256:string;resultSha256:string;combinationId:string;solver:{name:string;version:string};
  mapped:MappedMember[];nodes:ResultNodes;members:ResultMembers;utilizationByPiece?:Record<string,number>};
const maxAbs=(v:number[])=>v.reduce((a,b)=>Math.abs(b)>Math.abs(a)?b:a,0);
export function buildResultOverlay(kind:ResultOverlayKind,i:LayerInput):ResultOverlay{
  const byPiece=new Map<string,MappedMember[]>();for(const m of i.mapped)byPiece.set(m.originalId,[...(byPiece.get(m.originalId)??[]),m]);
  const station=(m:MappedMember)=>{const r=i.members[m.id];return r?mixedStations(r):null;};
  const reaction=(id:string)=>{const f=i.nodes[id]?.reaction_force_n;return f?Math.hypot(...f):0;};
  let units="";const pieces:{pieceId:string;value:number}[]=[];
  for(const [pieceId,segs] of byPiece){
    let value:number|null=null;
    if(kind==="displacement"||kind==="deformed-shape"){units="mm";value=1000*Math.max(...segs.flatMap(s=>[s.start,s.end]).map(n=>Math.hypot(...(i.nodes[n]?.translation_m??[0,0,0]))));}
    else if(kind==="bending-moment"){units="kN·m";const v=segs.flatMap(s=>(station(s)??[]).flatMap(t=>[t.my_nm,t.mz_nm]));value=v.length?Math.abs(maxAbs(v))/1000:null;}
    else if(kind==="shear"){units="kN";const v=segs.flatMap(s=>(station(s)??[]).flatMap(t=>[t.vy_n,t.vz_n]));value=v.length?Math.abs(maxAbs(v))/1000:null;}
    else if(kind==="axial"){units="kN";const v=segs.map(s=>{const r=i.members[s.id];return r?(r.kind==="frame"?maxAbs((station(s)??[]).map(t=>t.n_n)):r.axial_n):0;});value=maxAbs(v)/1000;}
    else if(kind==="reaction"){units="kN";const r=segs.flatMap(s=>[s.start,s.end]).map(reaction);value=Math.max(...r)>1e-9?r.reduce((a,b)=>a+b,0)/1000:null;}
    else{units="utilização";value=i.utilizationByPiece?.[pieceId]??null;}
    if(value!==null&&Number.isFinite(value))pieces.push({pieceId,value});
  }
  return {schema_version:"jpn.studio-result-overlay/1",kind,units:units||"mm",binding:{inputSha256:i.inputSha256,resultSha256:i.resultSha256,combinationId:i.combinationId,solver:i.solver},
    pieces,computedStructuralApproval:false,fabricationRelease:false};
}
/** Overlay accepted for display ONLY if it is fully traced to the displayed model and the current input hash. */
export function acceptOverlay(overlay:ResultOverlay,model:{pieces:readonly {id:string}[]},expectedInputSha256:string):{ok:true}|{ok:false;issues:OverlayIssue[]}{
  const issues=reviewResultOverlay(overlay,model,expectedInputSha256);return issues.length?{ok:false,issues}:{ok:true};
}
/** Blue (low) -> amber -> red (high) ramp; verification colours keep 1.0 as the red limit. Colours never verify resistance. */
export function overlayColors(overlay:ResultOverlay){
  const v=overlay.pieces.map(p=>Math.abs(p.value)),min=v.length?Math.min(...v):0,max=overlay.kind==="verification"?Math.max(1,...v):(v.length?Math.max(...v):0);
  const colors:Record<string,number>={};
  for(const p of overlay.pieces){
    const t=max>min?Math.min(1,Math.max(0,(Math.abs(p.value)-min)/(max-min))):0;
    const r=Math.round(64+t*(214-64)),g=Math.round(t<.5?107+t*2*(150-107):150-(t-.5)*2*(150-60)),b=Math.round(145*(1-t)+40*t);
    colors[p.pieceId]=(r<<16)|(Math.max(0,Math.min(255,g))<<8)|b;
  }
  return {colors,min,max,valueMax:v.length?Math.max(...v):0,units:overlay.units};
}
