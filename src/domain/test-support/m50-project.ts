import {readFileSync} from "node:fs";
import {m49GarageProject,refreshM49Garage} from "./m49-garage-project";
import {structureSignature} from "../calculations/project-basis";
import type {Project} from "../models";
import type {MemberDesignDeclaration} from "../coldformed-design";

/** Existing verified Ue gross geometry, explicit finite axial brace and measured
 * node bindings in a SYNTHETIC garage. Critical loads below are TEST inputs;
 * they never establish normative stability or a safe existing construction. */
export function m50Project(){
  const p=m49GarageProject(),d=p.workspace.spatialPreparation!,g=p.workspace.physicalStructure!;
  p.name="M50 synthetic garage, finite brace and Ue beam";
  const historical=JSON.parse(readFileSync(new URL("../../../docs/validation/coldformed-design/integrated-tension.json",import.meta.url),"utf8")).cases[0].design_input;
  const s=historical.design.section,source="M50 synthetic geometry and loads; not a site survey or normative critical study",revision="M50-1";
  g.revision=revision;g.nodes.push({id:"R",x:3000,y:-1000,z:3000});
  g.pieces.push({id:"BRACE",role:"web",start:"C0",end:"R"});
  d.physicalCatalog!.sections.push({id:"UE",areaCm2:s.area_m2*1e4,iyCm4:s.iy_m4*1e8,izCm4:s.iz_m4*1e8,jCm4:historical.solver_j_m4*1e8,sectionSource:source,sectionRevision:revision},
    {id:"BRACE-SECTION",areaCm2:.1,iyCm4:null,izCm4:null,jCm4:null,sectionSource:source,sectionRevision:revision});
  d.physicalCatalog!.assignments.find(a=>a.pieceId==="V0")!.sectionId="UE";
  d.physicalCatalog!.assignments.push({pieceId:"BRACE",materialId:"STEEL",sectionId:"BRACE-SECTION",rotationDeg:null});
  d.memberKinds!.push({pieceId:"BRACE",kind:"axial"});d.memberConnections.push({pieceId:"BRACE",start:"axial",end:"axial"});
  d.supports.find(n=>n.nodeId==="B0")!.dofs[0]="free";
  d.supportInterfaces!.find(n=>n.nodeId==="B0")!.dofs[0]="free";
  d.supportInterfaces!.find(n=>n.nodeId==="B0")!.restraintBasis="Synthetic roller: UX free, UY/UZ and rotations restrained; actual member ends release bending and retain torsion";
  const dofs=["fixed","fixed","fixed","free","free","free"] as const;
  d.supports.push({nodeId:"R",dofs:[...dofs]});
  d.supportInterfaces!.push({nodeId:"R",side:"internal",kind:"existing-concrete",dofs:[...dofs],source,revision,
    loadPath:"Axial brace -> explicitly declared existing interface R",restraintBasis:"Synthetic translational restraint; no rotational DOF exists at axial-only node R",reviewStatus:"site-reviewed"});
  d.loading!.roofArea[0].knM2=.02;d.loading!.roofArea[1].knM2=.03;
  d.cases.push({id:"N",source:"Synthetic 100 N compression, 10 N transverse disturbance and 0.01 Nm torsion"});
  d.loads=[{id:"50505050-5050-4050-8050-505050505050",caseId:"N",nodeId:"B0",fxKn:-.1,fyKn:0,fzKn:0,mxKnm:0,myKnm:0,mzKnm:0},
    {id:"50505050-5050-4050-8050-505050505051",caseId:"N",nodeId:"C0",fxKn:0,fyKn:.01,fzKn:0,mxKnm:.00001,myKnm:0,mzKnm:0}];
  const reference={...d.engineeringCombinations!.actions[0].reference,source,revision};
  d.engineeringCombinations!.actions.push({caseId:"N",category:"variable",exclusiveGroup:null,reference});
  for(const c of d.combinations)c.factors.N=1;
  for(const c of d.engineeringCombinations!.combinations)c.terms.push({caseId:"N",gamma:1,psi:1,reference});
  d.resistance=[{pieceId:"V0",family:"cold-formed",profileDesignation:"Synthetic Ue 100x50x15x2, ri=3 mm",fyMpa:250,fuMpa:400,
    bucklingYM:6,bucklingZM:6,lateralRestraintM:6,source,revision,restraintDescription:"Declared support DOFs at 0/6 m and a finite axial brace at 3 m; no ideal intermediate brace inferred",
    normativeReference:"NBR 14762:2010 partial procedures C.3/C.4/9.8.3/9.9 from supplied documents; no complete member approval",
    sectionProperties:{wyCm3:s.wy_m3*1e6,wzCm3:s.wz_m3*1e6},
    sectionPropertyResolutions:{areaCm2:historical.property_resolutions.area_m2*1e4,iyCm4:historical.property_resolutions.iy_m4*1e8,izCm4:historical.property_resolutions.iz_m4*1e8,
      jCm4:historical.property_resolutions.j_m4*1e8,wyCm3:historical.property_resolutions.wy_m3*1e6,wzCm3:historical.property_resolutions.wz_m3*1e6},
    geometry:{version:1,basis:"physical-engineer-declaration",shape:"u-stiffened",dimensionsMm:{height:100,width:50,lip:15,wallThickness:2,insideRadius:3},source,revision},
  }];
  refreshM49Garage(p);
  const capacity=(units:"N"|"Nm",limit:number|null=null)=>({positive:limit,negative:limit,units,source:"Declared test capacity only; not calculated by JPN",revision});
  d.physicalRestraints={schema_version:"jpn.physical-restraints/1",geometrySignature:structureSignature(p),items:[
    ...(["A0","B0"] as const).flatMap((nodeId,index)=>([
      {id:nodeId+"-Y",pieceId:"V0",nodeId,positionM:index*6,kind:"lateral" as const,directionGlobal:[0,1,0] as [number,number,number],binding:{kind:"support" as const},capacity:capacity("N"),source,revision,physicalBasis:"Existing declared Y support DOF"},
      {id:nodeId+"-Z",pieceId:"V0",nodeId,positionM:index*6,kind:"lateral" as const,directionGlobal:[0,0,1] as [number,number,number],binding:{kind:"support" as const},capacity:capacity("N"),source,revision,physicalBasis:"Existing declared Z support DOF"},
      {id:nodeId+"-T",pieceId:"V0",nodeId,positionM:index*6,kind:"torsional" as const,directionGlobal:[1,0,0] as [number,number,number],binding:{kind:"support" as const},capacity:capacity("Nm",.003),source,revision,physicalBasis:"Existing declared RX support DOF and torsion-connected member ends"},
    ])),
    {id:"C0-BRACE",pieceId:"V0",nodeId:"C0",positionM:3,kind:"lateral",directionGlobal:[0,1,0],binding:{kind:"axial-member",pieceId:"BRACE"},capacity:capacity("N",5),source,revision,
      physicalBasis:"Finite EA/L of the existing axial member, not a rigid Y support"},
  ]};
  return p;
}

export function declareM50Studies(project:Project,bases:{pieceId:string;basisSha256:string}[]){
  const p=structuredClone(project),basis=bases.find(b=>b.pieceId==="V0")!.basisSha256;
  const modes={global:1e8,local:2e8,distortional:3e8};
  p.workspace.spatialPreparation!.memberDesign=["ULS_G","ULS_W","ULS_NET"].map(combinationId=>({
    schema_version:"jpn.member-design-declaration/1",pieceId:"V0",combinationId,
    study:{source:"Synthetic critical inputs exercise binding and partial resistance; NOT a verified buckling study",revision:"M50-1",responsible:"Independent software validation",
      basis_sha256:basis,boundary_and_load_pattern:"Actual continuous N/My/Mz/V/T with explicit finite intermediate brace and endpoint restraints; test critical values remain external and conditional",minimum_search:"reviewed-elastic-mode-minima"},
    critical:{compression:{...modes},my_positive:{...modes},my_negative:{...modes},mz_positive:{...modes},mz_negative:{...modes}},
    tension:null,unstiffenedSingleWeb:true,
  } satisfies MemberDesignDeclaration));
  return p;
}
