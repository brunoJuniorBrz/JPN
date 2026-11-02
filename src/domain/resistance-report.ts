import type { Project } from "./models";
import { generateStructure } from "./calculations/structure";
import { adaptMixedProject } from "./mixed-adapter";
import { adaptLoadedMixedProject } from "./loaded-mixed-adapter";
import { canonicalSpatialInput } from "./spatial-analysis";
import { mixedInputHash } from "./mixed-analysis";
import { extractMemberDemands, type DemandInput } from "./member-demands";
import { resistancePreparationSchema } from "./resistance-preparation";
import { elasticMemberReference } from "./resistance-elastic-reference";
import { extractContinuousDemands } from "./continuous-demands";
import { coldFormedDiagnostics } from "./cold-formed-properties";

const normativeModes=[
  {id:"tension",label:"Tração: escoamento bruto e ruptura da seção efetiva/líquida"},
  {id:"compression",label:"Compressão: instabilidades globais e resistência da seção"},
  {id:"bending",label:"Flexão: seção e instabilidade lateral com torção"},
  {id:"shear",label:"Cisalhamento"},{id:"torsion",label:"Torção"},
  {id:"interaction",label:"Interação de esforços concomitantes"},
  {id:"service",label:"Serviço: limites, referência de deslocamento e combinações pertinentes"},
];
/** Unit control only: no extreme fibre stress, resistance or utilization. */
export function axialMeanStressMPa(normalN:number,areaCm2:number|null){
  if(areaCm2===null||!Number.isFinite(areaCm2)||areaCm2<=0||!Number.isFinite(normalN))return null;
  const stress=normalN/(areaCm2*1e-4)/1e6;
  return Number.isFinite(stress)?stress:null;
}

/** Engineering blockers and idealized controls, NEVER an implementation of
 * unavailable ABNT clauses. States cannot be promoted by supplying a string. */
export async function buildResistanceReport(project:Project,prepared:DemandInput,value:unknown,jointTrace?:unknown){
  const current=await (project.workspace.spatialPreparation?.loading?adaptLoadedMixedProject(project):adaptMixedProject(project));
  if(current.input_sha256!==prepared.input_sha256||current.preparation_sha256!==prepared.preparation_sha256||canonicalSpatialInput(current.mapping)!==canonicalSpatialInput(prepared.mapping))
    throw new Error("STALE_RESISTANCE_ANALYSIS: projeto/discretização/declarações diferem da análise; execute novamente.");
  const demands=await extractMemberDemands(prepared,value),draft=project.workspace.spatialPreparation!,model=generateStructure(project).model!;
  const continuousDemands=jointTrace?await extractContinuousDemands(prepared,value,jointTrace):null;
  const declarations=draft.resistance??[];
  if(new Set(declarations.map(d=>d.pieceId)).size!==declarations.length||declarations.some(d=>!model.pieces.some(p=>p.id===d.pieceId)))throw new Error("RESISTANCE_DECLARATIONS: cadastro resistente duplicado ou peça órfã.");
  const pieces=demands.pieces.map(demand=>{
    const piece=model.pieces.find(p=>p.id===demand.pieceId);
    if(!piece)throw new Error("RESISTANCE_DECLARATIONS: peça original sem geometria atual.");
    const group=draft.groups[piece.role],parsed=resistancePreparationSchema.safeParse(declarations.find(d=>d.pieceId===piece.id)),d=parsed.success?parsed.data:null;
    const issues:string[]=[];
    if(!d)issues.push("Cadastre família, aço, fontes, propriedades e condições resistentes desta peça.");
    else{
      if(!d.family)issues.push("Família real do perfil pendente; o nome visual não a determina.");
      if(!d.profileDesignation)issues.push("Designação física do perfil pendente; não se usa o nome provisório 3D.");
      for(const k of ["fyMpa","fuMpa","bucklingYM","bucklingZM","lateralRestraintM"] as const)if(d[k]===null||!Number.isFinite(d[k])||d[k]<=0)issues.push(`${k}: propriedade positiva pendente.`);
      if(d.fuMpa!==null&&d.fyMpa!==null&&d.fuMpa<d.fyMpa)issues.push("fu menor que fy: dados contraditórios.");
      if(!d.source.trim()||!d.revision.trim()||!d.restraintDescription.trim())issues.push("Fontes, revisão ou descrição real das contenções pendentes.");
      if(!d.normativeReference.trim())issues.push("Norma, edição, cláusulas e domínio de aplicação declarados ainda pendentes.");
      if(!d.geometry)issues.push("Geometria resistente física não declarada; dimensões visuais não são utilizadas.");
      else{
        const g=d.geometry,required:Record<typeof g.shape,string[]>={u:["height","width","wallThickness","insideRadius"],"u-stiffened":["height","width","wallThickness","lip","insideRadius"],i:["height","width","webThickness","flangeThickness"],rhs:["height","width","wallThickness","insideRadius"],chs:["diameter","wallThickness"],angle:["height","width","wallThickness","insideRadius"],other:[]};
        if(g.shape==="other")issues.push("Geometria fora das tipologias cadastradas; procedimento específico necessário.");
        for(const key of required[g.shape]){const n=g.dimensionsMm[key as keyof typeof g.dimensionsMm];if(n===undefined||n===null||(key==="insideRadius"?n<0:n<=0))issues.push(`Dimensão física ${key} pendente.`);}
        for(const [key,n]of Object.entries(g.dimensionsMm))if(n!==null&&n!==undefined&&(!Number.isFinite(n)||(key==="insideRadius"?n<0:n<=0)||n>1e6))issues.push(`${key}: dimensão fora do domínio numérico.`);
        const dims=g.dimensionsMm,t=dims.wallThickness;
        if(t&&[dims.height,dims.width,dims.diameter].some(x=>x!==undefined&&x!==null&&2*t>=x))issues.push("Espessura incompatível com dimensões externas declaradas.");
        if(dims.webThickness&&dims.width&&dims.webThickness>=dims.width||dims.flangeThickness&&dims.height&&2*dims.flangeThickness>=dims.height)issues.push("Geometria I declarada degenerada.");
      }
      for(const key of ["areaCm2","iyCm4","izCm4","jCm4"] as const){const declared=d.sectionProperties[key];if(declared!==undefined&&declared!==null&&declared!==group[key])issues.push(`${key}: valor resistente difere da seção física usada no solver.`);}
      for(const key of ["wyCm3","wzCm3"])if(!d.sectionProperties[key])issues.push(`${key}: módulo elástico físico pendente.`);
    }
    const standard=d?.family==="cold-formed"?"ABNT NBR 14762:2010":"ABNT NBR 8800:2024 Versão Corrigida:2025";
    const referenceBlock=`${d?.family?standard:"Norma aplicável à família ainda a identificar"}: texto legítimo, cláusulas/condições integrais e exemplos independentes ainda necessários; nenhuma cláusula aplicada neste avaliador.`;
    const modes=[...normativeModes,...(d?.family==="cold-formed"?[{id:"local-distortional",label:"Flambagem local/distorcional e propriedades efetivas"}]:[{id:"local",label:"Instabilidade local e classificação da seção"}])];
    const verifications=modes.map(mode=>({id:mode.id,label:mode.label,status:"pending" as const,
      demandCoverage:"sampled-stations-only" as const,designResistanceN:null,utilization:null,clauseApplied:null,
      blockers:[referenceBlock,...issues,
        ...(demand.kind==="axial"&&["bending","shear","torsion","interaction"].includes(mode.id)?["Modelo exclusivamente axial não fornece estes esforços; isso não comprova a ausência física de excentricidades ou desses modos na obra."]:[]),
        ...(mode.id==="service"?["Referência de flecha relativa, limites e aplicabilidade SLS não implementados; cinco amostras não localizam extremo contínuo."]:[])]}));
    const axialMeanStress=demand.samples.map(s=>({sampleId:s.id,stressMPa:axialMeanStressMPa(s.forces.nN,group.areaCm2)}));
    if(axialMeanStress.some(s=>s.stressMPa===null))issues.push("Controle N/A indisponível: propriedade ausente ou limite numérico excedido.");
    const controls=elasticMemberReference(piece,group,d);
    return {pieceId:piece.id,role:piece.role,profileDesignation:d?.profileDesignation??null,family:d?.family??null,
      status:"incomplete" as const,allApplicableVerificationsComplete:false as const,approved:false as const,
      normativeReadiness:{status:!d?"pending-data":coldFormedDiagnostics(d,group,demand.lengthM).status,physical: d?coldFormedDiagnostics(d,group,demand.lengthM):null,continuousDemandStatus:continuousDemands?"continuous-verified":"unsupported",interactionStatus:"unsupported",combinationStatus:"pending-normative-source",normativeSourceStatus:"pending-normative-source",designResistance:null,utilization:null,clausesApplied:[] as string[],blockers:["Nenhum procedimento normativo completo disponível no registro do motor; fontes textuais não habilitam aprovação.",...issues]},
      dataIssues:issues,physicalProperties:group,declaration:d,verifications,
      analyticalControls:{normative:false as const,status:"reference-only" as const,
        description:"N/A é apenas tensão média axial elástica; não representa tensões extremas de flexão, resistência, utilização ou segurança.",axialMeanStress,idealizedReferences:controls}};
  });
  const binding={...demands.binding,evaluatorVersion:"jpn.resistance-report/1",declarationsSha256:await mixedInputHash(declarations)};
  const report={schema_version:"jpn.resistance-report/1" as const,status:"partial-demands-and-preparation" as const,
    approvedForFabrication:false as const,structureStatus:"NOT_APPROVED_FOR_FABRICATION" as const,
    normativeProceduresImplemented:[] as string[],binding,physicalInput:current.request,
    engineeringCombinations:draft.engineeringCombinations??null,demands,pieces,continuousDemands,
    remaining:["Seleção e validação normativa das ações/combinações ainda pendentes na M22.","Procedimentos resistentes normativos integrais ainda indisponíveis; nenhuma verificação ATENDE/NÃO ATENDE emitida.","Missão 24: ligações, apoios, contenções, estabilidade global/efeitos adicionais e revisão do engenheiro."]};
  return {...report,reportSha256:await mixedInputHash(report)};
}
export type ResistanceReport=Awaited<ReturnType<typeof buildResistanceReport>>;

export async function assertResistanceReportCurrent(report:ResistanceReport,project:Project,prepared:DemandInput,result:unknown,jointTrace?:unknown){
  const {reportSha256,...body}=report;
  if(await mixedInputHash(body)!==reportSha256)throw new Error("STALE_RESISTANCE_REPORT: conteúdo do relatório foi alterado.");
  const next=await buildResistanceReport(project,prepared,result,jointTrace);
  if(next.reportSha256!==reportSha256)throw new Error("STALE_RESISTANCE_REPORT: dados, norma ou resultado do solver mudaram.");
}
