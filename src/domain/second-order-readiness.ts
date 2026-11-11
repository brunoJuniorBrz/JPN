/** M43-P1: make the current solver's LINEAR scope explicit at the analysis
 * boundary. This is a fail-closed capability audit, not a P-Delta calculator,
 * buckling verification, or a test of actual support capacity.
 */
type V=[number,number,number];
type StabilityRequest={
  schema_version:"jpn.mixed3d/1"|"jpn.mixed3d/2";
  theory:"linear-elastic-frame-axial";
  project:{id:string;revision:string};
  nodes:readonly {id:string;x_m:number;y_m:number;z_m:number}[];
  members:readonly {id:string;kind:"frame"|"axial"}[];
  combinations:readonly {id:string}[];
};
type StabilityResult={
  schema_version:"jpn.mixed3d-result/1"|"jpn.mixed3d-result/2";
  project:{id:string;revision:string};
  combinations:Record<string,{
    nodes:Record<string,{translation_m:V}>;
    equilibrium:{relative_residual:number};
  }>;
};
function fail(code:string,message:string):never{throw Error(code+": "+message);}

/** An apparent "small drift" does NOT imply second-order stability is verified.
 * Reports preserve observed LINEAR displacements, class of members and the
 * actual unimplemented capabilities, without selecting effective lengths,
 * imperfection magnitudes or material stiffness factors.
 */
export function auditSecondOrderReadiness(
  request:StabilityRequest,result:StabilityResult
){
  const expectedVersion=request.schema_version==="jpn.mixed3d/2"?
    "jpn.mixed3d-result/2":"jpn.mixed3d-result/1";
  if(result.schema_version!==expectedVersion||
    request.project.id!==result.project.id||
    request.project.revision!==result.project.revision)
    fail("M43_STALE_ANALYSIS","versão, obra ou revisão não correspondem");
  if(request.theory!=="linear-elastic-frame-axial")
    fail("M43_UNKNOWN_THEORY","o contrato atual só suporta análise linear");
  const requestCaseIds=request.combinations.map(c=>c.id),
    resultCaseIds=Object.keys(result.combinations);
  if(new Set(requestCaseIds).size!==requestCaseIds.length||
    requestCaseIds.length!==resultCaseIds.length||
    requestCaseIds.some(id=>!resultCaseIds.includes(id)))
    fail("M43_CASE_MISMATCH","não é possível auditar resultado de combinação ausente");
  const nodeIds=request.nodes.map(n=>n.id);
  if(!request.nodes.length||new Set(nodeIds).size!==nodeIds.length)
    fail("M43_GEOMETRY_INVALID","nós incompletos ou repetidos");
  const axes:[number[],number[],number[]]=[
    request.nodes.map(n=>n.x_m),request.nodes.map(n=>n.y_m),
    request.nodes.map(n=>n.z_m),
  ];
  const modelSpanM=Math.max(1e-5,
    ...axes.map(a=>Math.max(...a)-Math.min(...a)));
  if(!Number.isFinite(modelSpanM)||modelSpanM<=0)
    fail("M43_GEOMETRY_INVALID","dimensão física do modelo não finita");
  const combinations=requestCaseIds.map(id=>{
    const solved=result.combinations[id],
      nodeKeys=Object.keys(solved.nodes);
    if(nodeKeys.length!==nodeIds.length||nodeIds.some(n=>!nodeKeys.includes(n)))
      fail("M43_NODE_MISMATCH",id+" retornou nós diferentes do modelo físico");
    if(!Number.isFinite(solved.equilibrium.relative_residual)||
      solved.equilibrium.relative_residual>1e-8||
      solved.equilibrium.relative_residual<0)
      fail("M43_LINEAR_EQUILIBRIUM_INVALID",id+" sem equilíbrio linear conferido");
    let maxTranslationM=0,maxNodeId="";
    for(const nodeId of nodeIds){
      const d=solved.nodes[nodeId].translation_m;
      if(d.length!==3||!d.every(Number.isFinite))
        fail("M43_NONFINITE_TRANSLATION",id+"/"+nodeId);
      const magnitude=Math.hypot(...d);
      if(magnitude>=maxTranslationM){maxTranslationM=magnitude;maxNodeId=nodeId;}
    }
    return {combinationId:id,maximumNodalTranslationM:maxTranslationM,
      referenceModelSpanM:modelSpanM,
      maximumTranslationToSpanRatio:maxTranslationM/modelSpanM,
      governingNodeId:maxNodeId,
      linearEquilibriumResidual:solved.equilibrium.relative_residual,
      geometricStiffnessIncluded:false as const,
      secondOrderResultAvailable:false as const};
  });
  const frames=request.members.filter(m=>m.kind==="frame").length,
    axials=request.members.filter(m=>m.kind==="axial").length;
  const topology=frames&&axials?"mixed-frame-axial":
    frames?"frame-only":axials?"axial-only":"empty";
  if(topology==="empty")
    fail("M43_NO_MEMBERS","análise de estabilidade requer elementos físicos");
  const blockers=[
    "M43_SECOND_ORDER_NOT_EXECUTED: deslocamentos e reações atuais são estritamente lineares.",
    "M43_BUCKLING_MODES_PENDING: não há modos nem autovalores de instabilidade global.",
    "M43_IMPERFECTION_SOURCE_PENDING: imperfeições geométricas e ações nocionais não foram conferidas.",
    "M43_STIFFNESS_REDUCTIONS_PENDING: reduções de rigidez e parâmetros de estabilidade não estão homologados.",
    ...(axials?["M43_AXIAL_SPRING_KG_UNSUPPORTED: Spring3D EA/L não foi validado com rigidez geométrica de barras axiais."]:[]),
  ];
  return {
    schema_version:"jpn.second-order-readiness/1" as const,
    status:"second-order-required-review" as const,
    topology,frameMemberCount:frames,axialMemberCount:axials,
    combinations,blockers,
    baselineTheory:request.theory,
    baselineIsLinear:true as const,
    pDeltaExecuted:false as const,
    pSmallDeltaExecuted:false as const,
    geometricStiffnessValidated:false as const,
    bucklingModesCalculated:false as const,
    notionalLoadsVerified:false as const,
    effectiveLengthsVerified:false as const,
    normativeStabilityVerified:false as const,
    computedStructuralApproval:false as const,
    fabricationRelease:false as const,
    releaseGate:"NOT_READY_BLOCKED" as const,
    limitations:[
      "Deslocamento linear pequeno não comprova estabilidade nem dispensa efeitos de segunda ordem.",
      "Benchmark analítico cantilever M43-P1 é isolado e não ativa o método P-Delta em obras reais.",
      "Não presume K de flambagem, imperfeições, rigidez da alvenaria, contraventamentos ou efeitos Kg dos elementos axiais.",
    ],
  };
}
