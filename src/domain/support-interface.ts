import {z} from "zod";
import type {Project} from "./models";
import type {SpatialPreparation} from "./spatial-preparation";
import type {PhysicalGeometry} from "./structure";

const evidence=z.string().trim().min(5).max(1000);
const n=z.number().finite().nonnegative().max(1e9);
const axis=z.enum(["fixed","free"]);
export const supportInterfaceSchema=z.object({
  nodeId:z.string().min(1).max(100),
  side:z.enum(["A","B","internal"]),
  kind:z.enum(["new-steel-column","existing-masonry","existing-concrete","foundation","other"]),
  // Observations explicitly tied to FE DOFs, never new constraints.
  dofs:z.tuple([axis,axis,axis,axis,axis,axis]),
  source:evidence,revision:evidence,loadPath:evidence,restraintBasis:evidence,
  reviewStatus:z.enum(["hypothesis","site-reviewed"]),
  capacity:z.object({
    compressionKn:n.nullable(),upliftKn:n.nullable(),horizontalShearKn:n.nullable(),
    source:evidence,revision:evidence,
  }).strict().optional(),
  /** N4: declared anchor type (manufacturer data); used when this support has no own declared capacity. */
  anchorTypeId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/).optional(),
}).strict();
/** N4: anchor type declared by the engineer from manufacturer data. The JPN never computes anchor or masonry capacity. */
export const anchorTypeSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/),label:evidence,
  tensionDesignKn:z.number().finite().positive().max(1e6),
  compressionDesignKn:z.number().finite().positive().max(1e6).nullable(),
  source:evidence,revision:evidence,
}).strict();
export const anchorTypesSchema=z.array(anchorTypeSchema).max(50)
  .refine(items=>new Set(items.map(x=>x.id)).size===items.length,"Tipos de ancoragem com ID repetido.");
export type AnchorType=z.infer<typeof anchorTypeSchema>;
export const supportInterfacesSchema=z.array(supportInterfaceSchema).max(200)
  .refine(items=>new Set(items.map(x=>x.nodeId)).size===items.length,
    "Cada nó pode ter uma única interface física de apoio.");
export type SupportInterface=z.infer<typeof supportInterfaceSchema>;
export type SupportIssue={code:string;message:string};

const typeByGuided={
  "new-column":"new-steel-column",
  "existing-masonry":"existing-masonry",
  "existing-concrete":"existing-concrete",
} as const;

/** Keep site survey / steel column / wall / concrete distinct from solver restraints.
 * Fixed DOFs are supplied ONLY by the existing, independently reviewed support
 * declaration. This audit never invents supports, stiffness or wall resistance. */
export function reviewSupportInterfaces(project:Pick<Project,"workspace">,
  draft:Pick<SpatialPreparation,"supports"|"supportInterfaces">,
  model:PhysicalGeometry|null):SupportIssue[]{
  const issues:SupportIssue[]=[];
  const add=(code:string,message:string)=>issues.push({code,message});
  const interfaces=draft.supportInterfaces??[];
  const nodes=new Set(model?.nodes.map(x=>x.id)??[]);
  const supports=new Map(draft.supports.map(x=>[x.nodeId,x]));
  for(const face of interfaces){
    if(!nodes.has(face.nodeId)){add("SUPPORT_INTERFACE_ORPHAN",face.nodeId+": nó da interface física não existe.");continue;}
    const d=supports.get(face.nodeId);
    if(!d||!d.dofs.some(x=>x==="fixed")){
      add("SUPPORT_INTERFACE_WITHOUT_RESTRAINT",face.nodeId+": interface sem apoio físico explícito no modelo.");
      continue;
    }
    if(d.dofs.some((v,i)=>v==="pending"||v!==face.dofs[i]))
      add("SUPPORT_INTERFACE_STALE",face.nodeId+": hipóteses de vínculos mudaram; refaça a revisão de apoio.");
    if(face.kind==="existing-masonry"||face.kind==="existing-concrete"){
      if(face.reviewStatus!=="site-reviewed")
        add("EXISTING_SUPPORT_PENDING",face.nodeId+": estrutura existente exige inspeção e hipótese física rastreável, não apenas escolha visual.");
    }
  }
  const guided=project.workspace.guidedSupport;
  // Once a nonstandard site support is declared, every restrained solver node
  // must map to a physical interface; an untracked reaction cannot be checked.
  const exceptional=!!guided&&(
    guided.coverage==="partial"||guided.left!=="new-column"||guided.right!=="new-column");
  if(interfaces.length||exceptional)for(const support of draft.supports){
    if(support.dofs.some(v=>v==="fixed")&&!interfaces.some(face=>face.nodeId===support.nodeId))
      add("SUPPORT_INTERFACE_UNMAPPED_NODE",support.nodeId+": apoio do solver não associado a um elemento físico.");
  }
  if(!guided)return issues;
  if(guided.coverage==="partial"&&!project.workspace.roofOutline)
    add("PARTIAL_ROOF_OUTLINE_PENDING","Cobertura parcial exige contorno real declarado, não o retângulo visual.");
  for(const [side,choice] of [["A",guided.left],["B",guided.right]] as const){
    if(choice==="unknown"){
      add("SUPPORT_KIND_PENDING","Lado "+side+": tipo de apoio ainda desconhecido.");
      continue;
    }
    // All-metal generated work preserves the historic supports editor.
    if(guided.left==="new-column"&&guided.right==="new-column"&&guided.coverage==="whole")continue;
    const found=interfaces.filter(face=>face.side===side);
    if(!found.length)add("SUPPORT_INTERFACE_REQUIRED","Lado "+side+": vincule ao menos um nó físico e DOFs do tipo "+choice+".");
    else if(found.some(face=>face.kind!==typeByGuided[choice]))
      add("SUPPORT_INTERFACE_KIND_MISMATCH","Lado "+side+": tipo físico cadastrado difere da obra guiada.");
  }
  return issues;
}

type Reaction={reaction_force_n:[number,number,number];reaction_moment_nm:[number,number,number]};
export type SupportReactionStatus="within-declared-capacity"|"exceeds-declared-capacity"|"capacity-pending";
export function assessSupportReactions(interfaces:readonly SupportInterface[],
  result:{combinations:Record<string,{nodes:Record<string,Reaction>}>}){
  return interfaces.flatMap(face=>Object.entries(result.combinations).map(([combinationId,combo])=>{
    const node=combo.nodes[face.nodeId];
    if(!node)throw new Error("SUPPORT_REACTION_MISSING: resultado não contém nó de apoio declarado.");
    const [fx,fy,fz]=node.reaction_force_n;
    if(![fx,fy,fz,...node.reaction_moment_nm].every(Number.isFinite))throw new Error("SUPPORT_REACTION_INVALID");
    // Global Z up: +Fz reacting on structure means compression on support.
    const demands={
      compressionKn:Math.max(0,fz)/1000,
      upliftKn:Math.max(0,-fz)/1000,
      horizontalShearKn:Math.hypot(fx,fy)/1000,
    };
    const checks=(["compressionKn","upliftKn","horizontalShearKn"] as const).map(key=>{
      const demandKn=demands[key],limitKn=face.capacity?.[key]??null;
      const status=limitKn===null?"capacity-pending":demandKn>limitKn+1e-9?"exceeds-declared-capacity":"within-declared-capacity";
      return {action:key,demandKn,declaredCapacityKn:limitKn,status};
    });
    const rotationalMomentKnM=Math.hypot(...node.reaction_moment_nm)/1000;
    const momentCapacityPending=rotationalMomentKnM>1e-9;
    const status:SupportReactionStatus=checks.some(c=>c.status==="exceeds-declared-capacity")?
      "exceeds-declared-capacity":checks.some(c=>c.status==="capacity-pending")||
      momentCapacityPending||face.reviewStatus!=="site-reviewed"?
      "capacity-pending":"within-declared-capacity";
    return {nodeId:face.nodeId,side:face.side,kind:face.kind,combinationId,
      reviewStatus:face.reviewStatus,status,checks,rotationalMomentKnM,momentCapacityPending,
      normativeApproval:false as const,
      limitations:["Capacidades foram declaradas, não calculadas pelo JPN; não verifica punção, ancoragem, alvenaria, concreto, fundação ou interação de esforços.",
        "Momento de reação não possui capacidade resistente verificada neste contrato; se presente, a capacidade do apoio permanece pendente.",
        "Comparação preliminar de reações combinadas: não é dimensionamento nem liberação de fabricação."]};
  }));
}

const EXISTING=new Set(["existing-masonry","existing-concrete"]);
export type AnchorStatus="within-declared-capacity"|"exceeds-declared-capacity"|"capacity-pending"|"no-demand";
type CapacitySource={valueKn:number;origin:"support"|"anchor-type";anchorTypeId:string|null;source:string;revision:string}|null;
/** N4: pull-out (and, informatively, compression) per support on an EXISTING wall or concrete element.
 * Demand = governing ULS reaction of the analysis result handed in (the /3 result, or the second-order result
 * when that is the active analysis). Capacity = declared per support or by declared anchor type; never computed.
 * No declared capacity -> "capacity-pending", never a pass. Masonry/concrete resistance (NBR 16868) is N10. */
export function assessAnchorPullout(input:{interfaces:readonly SupportInterface[];anchorTypes?:readonly AnchorType[];
  ulsCombinationIds:readonly string[]|null;result:{combinations:Record<string,{nodes:Record<string,Reaction>}>}}){
  const types=new Map((input.anchorTypes??[]).map(t=>[t.id,t]));
  const all=Object.keys(input.result.combinations);
  const uls=input.ulsCombinationIds?all.filter(id=>input.ulsCombinationIds!.includes(id)):all;
  const supports=input.interfaces.filter(f=>EXISTING.has(f.kind)).map(face=>{
    const type=face.anchorTypeId?types.get(face.anchorTypeId)??null:null;
    const capacity=(own:number|null|undefined,fromType:number|null|undefined):CapacitySource=>
      own!=null&&face.capacity?{valueKn:own,origin:"support",anchorTypeId:null,source:face.capacity.source,revision:face.capacity.revision}:
      fromType!=null&&type?{valueKn:fromType,origin:"anchor-type",anchorTypeId:type.id,source:type.source,revision:type.revision}:null;
    const per=uls.map(combinationId=>{
      const node=input.result.combinations[combinationId].nodes[face.nodeId];
      if(!node)throw new Error("SUPPORT_REACTION_MISSING: "+face.nodeId+" sem reação em "+combinationId);
      const fz=node.reaction_force_n[2];
      if(!Number.isFinite(fz))throw new Error("SUPPORT_REACTION_INVALID");
      // Global Z up: -Fz on the structure = the support pulls the steel down = anchor in tension.
      return {combinationId,pulloutKn:Math.max(0,-fz)/1000,compressionKn:Math.max(0,fz)/1000};
    });
    const check=(key:"pulloutKn"|"compressionKn",cap:CapacitySource)=>{
      const governing=per.reduce<typeof per[number]|null>((g,r)=>!g||r[key]>g[key]?r:g,null);
      const demandKn=governing?.[key]??0;
      const ratio=cap&&cap.valueKn>0?demandKn/cap.valueKn:null;
      const status:AnchorStatus=!cap?"capacity-pending":demandKn<=1e-9?"no-demand":demandKn>cap.valueKn+1e-9?"exceeds-declared-capacity":"within-declared-capacity";
      return {demandKn,governingCombinationId:demandKn>1e-9?governing!.combinationId:null,declaredCapacity:cap,ratio,status};
    };
    const pullout=check("pulloutKn",capacity(face.capacity?.upliftKn,type?.tensionDesignKn));
    const compression={...check("compressionKn",capacity(face.capacity?.compressionKn,type?.compressionDesignKn??null)),
      note:"Compressão sobre a parede: demanda informada x capacidade declarada; resistência da alvenaria (NBR 16868) fica para o N10."};
    const issues=[
      ...(face.anchorTypeId&&!type?["ANCHOR_TYPE_MISSING: tipo "+face.anchorTypeId+" não declarado."]:[]),
      ...(pullout.status==="capacity-pending"?["ANCHOR_CAPACITY_PENDING: declare a capacidade de cálculo à tração (ficha do fabricante) para "+face.nodeId+"."]:[]),
      ...(face.reviewStatus!=="site-reviewed"?["EXISTING_SUPPORT_PENDING: parede existente sem inspeção registrada."]:[]),
    ];
    return {nodeId:face.nodeId,side:face.side,kind:face.kind,reviewStatus:face.reviewStatus,pullout,compression,issues,critical:false};
  });
  const ratios=supports.map(s=>s.pullout.ratio??-1),maxRatio=Math.max(-1,...ratios);
  for(const s of supports)s.critical=s.pullout.status==="exceeds-declared-capacity"||s.pullout.status==="capacity-pending"||
    s.issues.length>0||(maxRatio>0&&s.pullout.ratio===maxRatio);
  const governing=supports.filter(s=>s.pullout.ratio!==null).sort((a,b)=>b.pullout.ratio!-a.pullout.ratio!)[0]??null;
  return {schema_version:"jpn.anchor-pullout/1" as const,combinationsConsidered:uls,
    combinationPurposeDeclared:input.ulsCombinationIds!==null,supports,
    governingSupport:governing?{nodeId:governing.nodeId,ratio:governing.pullout.ratio,combinationId:governing.pullout.governingCombinationId}:null,
    studioStatus:Object.fromEntries(supports.map(s=>[s.nodeId,s.pullout.status==="exceeds-declared-capacity"?"exceeds":s.pullout.status==="capacity-pending"||s.issues.length?"pending":s.critical?"governing":"ok"])) as Record<string,"exceeds"|"pending"|"governing"|"ok">,
    limitations:["Capacidades declaradas pelo engenheiro (ficha do fabricante); o JPN não calcula ancoragem nem alvenaria.",
      "Demanda no nó do modelo: distribuição entre chumbadores, excentricidade, efeito alavanca e borda não são verificados.",
      ...(input.ulsCombinationIds===null?["Combinações sem finalidade declarada: todas tratadas como ELU."]:[])],
    normativeApproval:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}
export type AnchorPulloutReport=ReturnType<typeof assessAnchorPullout>;