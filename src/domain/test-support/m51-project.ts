import {m34abProject,reviewM34Fixture} from "./m34ab-fixtures";
import {emptyPhysicalGroup} from "../physical-declaration";
import {structureSignature} from "../calculations/project-basis";
import {sectionAnalysisRequestSchema} from "../section-analysis";
import type {ElasticLtbStudy} from "../elastic-ltb-contracts";
import {supportInterfacesSchema} from "../support-interface";

export const m51Source="M51 synthetic straight I beam; pure end couples; not a surveyed building or verified design";
export const m51Revision="M51-1";
export const m51SectionRequest=sectionAnalysisRequestSchema.parse({schema_version:"jpn.section-analysis/1",units:"mm",
  geometry:{shape:"i",height:200,width:100,webThickness:6,flangeThickness:10,insideRadius:0},poisson:.3,
  source:m51Source,revision:m51Revision,responsible:"Independent analytical validation",convergence:.001});

/** Test fixture only. Values marked pending are explicitly replaced by an
 * actual geometric worker calculation before FE or API execution. */
export function m51Project(){
  const p=m34abProject(),source=m51Source,revision=m51Revision;
  p.name="M51 analytical 6 m I beam: fork/fork, free warping, pure couples";
  p.workspace.physicalStructure={schema_version:"jpn.declared-structure/1",source:"declared",units:"mm",provenance:source,revision,
    nodes:[{id:"A",x:0,y:0,z:0},{id:"B",x:6000,y:0,z:0}],pieces:[{id:"V",role:"beam",start:"A",end:"B"}]};
  const d=p.workspace.spatialPreparation!;
  delete d.physicalCatalog;delete d.loading;delete d.engineeringCombinations;delete d.connections;delete d.physicalRoofFaces;delete d.physicalFacades;delete d.serviceCriteria;delete d.memberDesign;delete d.roofRegions;
  d.groups.beam={...emptyPhysicalGroup(),steelGrade:"Synthetic elastic steel fy250",eGpa:200,gGpa:200/2.6,nu:.3,
    materialSource:source,materialRevision:revision,connection:"rigid",elementKind:"frame",rotationDeg:0};
  d.memberKinds=[{pieceId:"V",kind:"frame"}];d.memberConnections=[];
  // Existing v2 also transports interior displacement samples with NO added
  // distributed load. Legacy v1 transports end actions/nodal kinematics only.
  d.loading={version:1,selfWeight:null,uniform:[],roofArea:[]};
  d.supports=[{nodeId:"A",dofs:["fixed","fixed","fixed","fixed","free","free"]},
    {nodeId:"B",dofs:["free","fixed","fixed","fixed","free","free"]}];
  d.supportInterfaces=supportInterfacesSchema.parse(d.supports.map(s=>({nodeId:s.nodeId,side:"internal",kind:"other",dofs:[...s.dofs],source,revision,
    loadPath:"Explicit ideal fork fixture; demand only, no site capacity",restraintBasis:"UY/UZ/RX fixed, RY/RZ free; warping explicitly free in separate study",reviewStatus:"site-reviewed"})));
  d.cases=[{id:"M",source:"Synthetic opposite 10 kNm global My couples only; no self weight or transverse force"}];
  d.loads=[{id:"51515151-5151-4151-8151-515151515151",caseId:"M",nodeId:"A",fxKn:0,fyKn:0,fzKn:0,mxKnm:0,myKnm:-10,mzKnm:0},
    {id:"51515151-5151-4151-8151-515151515152",caseId:"M",nodeId:"B",fxKn:0,fyKn:0,fzKn:0,mxKnm:0,myKnm:10,mzKnm:0}];
  d.combinations=[{id:"LOW",factors:{M:1}},{id:"HIGH",factors:{M:3}},{id:"REVERSE",factors:{M:-1}},{id:"INVALID",factors:{M:1}}];
  d.connectionsReview="No rotational releases between beam and fork node; bending rotations free at supports";
  d.lateralSystem="Only six declared endpoint restraints, no sheet, purlin or intermediate brace";
  d.loadPathReview="Equal opposite end couples -> constant moment on beam; zero support forces";
  d.resistance=[{pieceId:"V",family:"welded",profileDesignation:"Synthetic doubly symmetric I 200x100x6x10, r0",fyMpa:250,fuMpa:400,
    bucklingYM:6,bucklingZM:6,lateralRestraintM:6,source,revision,sectionProperties:{},
    restraintDescription:d.lateralSystem,normativeReference:"ABNT NBR 8800:2024 resistance remains pending; M51 classical elastic bifurcation reference only",
    geometry:{version:1,basis:"physical-engineer-declaration",shape:"i",dimensionsMm:{height:200,width:100,webThickness:6,flangeThickness:10,insideRadius:0},source,revision}}];
  reviewM34Fixture(p);
  d.physicalRestraints={schema_version:"jpn.physical-restraints/1",geometrySignature:structureSignature(p),items:["A","B"].flatMap((nodeId,index)=>
    ([{suffix:"Y",kind:"lateral",directionGlobal:[0,1,0]},{suffix:"Z",kind:"lateral",directionGlobal:[0,0,1]},
      {suffix:"T",kind:"torsional",directionGlobal:[1,0,0]}] as const).map(r=>({id:nodeId+r.suffix,pieceId:"V",nodeId,positionM:index*6,
        kind:r.kind,directionGlobal:[...r.directionGlobal],binding:{kind:"support"},capacity:{positive:null,negative:null,units:r.kind==="torsional"?"Nm":"N",source,revision},
        source,revision,physicalBasis:"Explicit ideal fork test fixture, not a building capacity"})))};
  d.elasticLtbStudies=d.combinations.map(c=>({schema_version:"jpn.elastic-ltb-study/1",pieceId:"V",combinationId:c.id,
    procedure:"doubly-symmetric-I-uniform-moment-fork-free-warping",span:"whole-original-member",endWarping:["free","free"],loadHeightFromShearCenterM:c.id==="INVALID"?.1:0,
    momentPattern:"uniform-end-couples",source,revision,responsible:"Independent analytical validation",
    warpingBasis:"Synthetic open fork with no end plate or axial flange constraint; independent explicit free-warping boundary hypothesis"} satisfies ElasticLtbStudy));
  return p;
}
