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
}).strict();
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
    const status:SupportReactionStatus=checks.some(c=>c.status==="exceeds-declared-capacity")?
      "exceeds-declared-capacity":checks.some(c=>c.status==="capacity-pending")?
      "capacity-pending":"within-declared-capacity";
    const rotationalMomentKnM=Math.hypot(...node.reaction_moment_nm)/1000;
    return {nodeId:face.nodeId,side:face.side,kind:face.kind,combinationId,
      reviewStatus:face.reviewStatus,status,checks,rotationalMomentKnM,
      normativeApproval:false as const,
      limitations:["Capacidades foram declaradas, não calculadas pelo JPN; não verifica punção, ancoragem, alvenaria, concreto, fundação ou interação de esforços.",
        "Comparação preliminar de reações combinadas: não é dimensionamento nem liberação de fabricação."]};
  }));
}
