import {z} from "zod";
import type {Project} from "./models";
import type {SpatialPreparation} from "./spatial-preparation";
import type {PhysicalGeometry} from "./structure";
import type {EngineeringCombinations} from "./engineering-combinations";
import {nbr8681PermanentReferenceFactors,type Nbr8681UlsKind} from "./nbr8681-permanent-factors";

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
export type AnchorStatus="within-declared-capacity"|"exceeds-declared-capacity"|"capacity-pending"|"no-demand"|"verification-pending";
type CapacitySource={valueKn:number;origin:"support"|"anchor-type";anchorTypeId:string|null;source:string;revision:string}|null;
/** N4: pull-out (and, informatively, compression) per support on an EXISTING wall or concrete element.
 * Demand = governing ULS reaction of the analysis result handed in (the /3 result, or the second-order result
 * when that is the active analysis). Capacity = declared per support or by declared anchor type; never computed.
 * No declared capacity -> "capacity-pending", never a pass. Masonry/concrete resistance (NBR 16868) is N10.
 * A1 (NBR 8681 5.1.3.1; Tabelas 1 a 3): for each variable-load hypothesis there must be one ULS combination with every
 * permanent at its reference favorable gamma and one with every permanent at its reference unfavorable gamma, both
 * taken from the single source by the declared classification. Missing set, missing classification or missing
 * factors -> the support stays pending.
 * A3: shear and moment of the combination that governs tension are reported; their interaction is NOT verified. */
export function assessAnchorPullout(input:{interfaces:readonly SupportInterface[];anchorTypes?:readonly AnchorType[];
  ulsCombinationIds:readonly string[]|null;result:{combinations:Record<string,{nodes:Record<string,Reaction>}>};
  engineeringCombinations?:Pick<EngineeringCombinations,"actions"|"combinations">|null;
  /** NBR 8681 declaration (classification of each permanent action) used to look up the reference gamma. */
  nbr8681Declaration?:unknown}){
  const types=new Map((input.anchorTypes??[]).map(t=>[t.id,t]));
  const all=Object.keys(input.result.combinations);
  const ec=input.engineeringCombinations??null;
  const requestedULS=input.ulsCombinationIds;
  const missingResults=requestedULS?.filter(id=>!all.includes(id))??[];
  const nonULS=requestedULS?.filter(id=>ec?.combinations.some(c=>c.id===id&&c.purpose!=="ULS"))??[];
  // Never treat unknown-purpose combinations (potentially ELS) or a partial ULS envelope as a valid ELU check.
  const validULS=requestedULS!==null&&requestedULS.length>0&&!missingResults.length&&!nonULS.length;
  const uls=validULS?[...requestedULS]:[];
  const permanentIds=new Set(ec?.actions.filter(a=>a.category==="permanent").map(a=>a.caseId)??[]);
  const variableIds=ec?.actions.filter(a=>a.category!=="permanent").map(a=>a.caseId)??[];
  const ulsDeclarations=ec?.combinations.filter(c=>c.purpose==="ULS"&&uls.includes(c.id))??[];
  // gamma*psi rounded: 1,5 x 0,8 = 1.2000000000000002 in floating point must match a declared 1,2.
  const factorOf=(c:typeof ulsDeclarations[number],id:string)=>{
    const t=c.terms.find(t=>t.caseId===id);return t?Number((t.gamma*t.psi).toFixed(9)):0;
  };
  type Ec=typeof ulsDeclarations[number];
  // ULS kind from the combination's traceable clause (the generator writes 5.1.3.1 / 5.1.3.2 / 5.1.3.3).
  const kindOf=(c:Ec):Nbr8681UlsKind|null=>{const cl=c.reference.clause.trim();
    return cl==="5.1.3.1"?"normal":cl==="5.1.3.2"?"special":cl==="5.1.3.3"?"exceptional":null;};
  const signature=(c:Ec)=>JSON.stringify([kindOf(c),variableIds.map(id=>[id,factorOf(c,id)])]);
  // Reference gamma of each permanent from the single source (data/normas/nbr8681-2025-combinations.json), by the
  // declared classification (Tabela 1 type, Tabela 2 grouped, Tabela 3). Never inferred from the combinations received:
  // G1 = 1,25 with G2 = 1,00 must not count as the unfavorable set when G2's unfavorable reference is > 1,0.
  const referenceCache=new Map<Nbr8681UlsKind,Map<string,{gu:number;gf:number}>|null>();
  const referenceFor=(kind:Nbr8681UlsKind)=>{
    if(!referenceCache.has(kind)){
      let m:Map<string,{gu:number;gf:number}>|null=null;
      const d=input.nbr8681Declaration as Parameters<typeof nbr8681PermanentReferenceFactors>[0]|null|undefined;
      if(d&&(d.permanentMode==="separate"||d.permanentMode==="grouped")&&Array.isArray(d.actions))
        try{m=new Map(nbr8681PermanentReferenceFactors(d,kind).map(p=>[p.caseId,{gu:p.gu,gf:p.gf}]));}catch{m=null;}
      referenceCache.set(kind,m);
    }
    return referenceCache.get(kind)!;
  };
  // The permanent-only case does not produce a suction hypothesis if variable-load ULS exist.
  // Demand the minimum permanent for every distinct ACTIVE variable-load vector, not just a global G-only case.
  const activeVariableULS=ulsDeclarations.filter(c=>variableIds.some(id=>factorOf(c,id)>1e-12));
  const requiredULS=activeVariableULS.length?activeVariableULS:ulsDeclarations;
  const unclassified=new Set<string>();
  if(input.nbr8681Declaration==null)for(const id of permanentIds)unclassified.add(id);
  for(const c of ulsDeclarations){
    const kind=kindOf(c);
    if(!kind){unclassified.add("combinação "+c.id+" sem item 5.1.3.x");continue;}
    const refs=referenceFor(kind);
    for(const id of permanentIds)if(!refs?.has(id))unclassified.add(id);
  }
  const classificationVerified=permanentIds.size>0&&unclassified.size===0;
  const permanentsAt=(c:Ec,bound:"gf"|"gu")=>{
    const kind=kindOf(c),refs=kind?referenceFor(kind):null;
    return !!refs&&[...permanentIds].every(id=>{
      const t=c.terms.find(t=>t.caseId===id),r=refs.get(id);
      if(!t||!r||Math.abs(t.psi-1)>1e-12)return false;
      return bound==="gf"?t.gamma<=r.gf+1e-9:t.gamma>=r.gu-1e-9;
    });
  };
  // A minimum-permanent combination must pair with EACH actual variable-load vector.
  // A standalone 1.0 G combination cannot validate 1.25 G + 1.4 W (HC-C).
  const favorableCombinationIds=classificationVerified?ulsDeclarations.filter(c=>permanentsAt(c,"gf")).map(c=>c.id):[];
  const favorableSignatures=new Set(ulsDeclarations.filter(c=>favorableCombinationIds.includes(c.id)).map(signature));
  const missingFavorableCombinationIds=classificationVerified?requiredULS.filter(c=>!favorableSignatures.has(signature(c))).map(c=>c.id):[];
  const verifiable=validULS&&!!ec&&classificationVerified;
  const favorableSet=!verifiable?"unverified" as const:
    favorableCombinationIds.length>0&&missingFavorableCombinationIds.length===0?"present" as const:"missing" as const;
  // The unfavorable set is also needed per hypothesis (NBR 8681 5.1.3.1): where a permanent action itself lifts the
  // support (e.g. G on the adjacent span of a continuous beam), the unfavorable set + suction governs. Each permanent
  // must reach ITS reference unfavorable gamma in one combination of that vector. (Per-action mixes, 5.1.4.1, stay with the engineer.)
  const unfavorableSignatures=new Set(classificationVerified?ulsDeclarations.filter(c=>permanentsAt(c,"gu")).map(signature):[]);
  const missingUnfavorableCombinationIds=classificationVerified?requiredULS.filter(c=>!unfavorableSignatures.has(signature(c))).map(c=>c.id):[];
  const unfavorableSet=!verifiable?"unverified" as const:
    missingUnfavorableCombinationIds.length===0?"present" as const:"missing" as const;
  const supports=input.interfaces.filter(f=>EXISTING.has(f.kind)).map(face=>{
    const type=face.anchorTypeId?types.get(face.anchorTypeId)??null:null;
    const capacity=(own:number|null|undefined,fromType:number|null|undefined):CapacitySource=>
      own!=null&&face.capacity?{valueKn:own,origin:"support",anchorTypeId:null,source:face.capacity.source,revision:face.capacity.revision}:
      fromType!=null&&type?{valueKn:fromType,origin:"anchor-type",anchorTypeId:type.id,source:type.source,revision:type.revision}:null;
    const per=uls.map(combinationId=>{
      const node=input.result.combinations[combinationId].nodes[face.nodeId];
      if(!node)throw new Error("SUPPORT_REACTION_MISSING: "+face.nodeId+" sem reação em "+combinationId);
      const [fx,fy,fz]=node.reaction_force_n;
      if(![fx,fy,fz,...node.reaction_moment_nm].every(Number.isFinite))throw new Error("SUPPORT_REACTION_INVALID");
      // Global Z up: -Fz on the structure = the support pulls the steel down = anchor in tension.
      return {combinationId,pulloutKn:Math.max(0,-fz)/1000,compressionKn:Math.max(0,fz)/1000,
        horizontalShearKn:Math.hypot(fx,fy)/1000,momentKnM:Math.hypot(...node.reaction_moment_nm)/1000};
    });
    const check=(key:"pulloutKn"|"compressionKn",cap:CapacitySource)=>{
      if(!validULS)return {demandKn:null,governingCombinationId:null,declaredCapacity:cap,ratio:null,
        status:"verification-pending" as const,concurrentHorizontalShearKn:null,concurrentMomentKnM:null};
      const governing=per.reduce<typeof per[number]|null>((g,r)=>!g||r[key]>g[key]?r:g,null);
      const demandKn=governing?.[key]??0;
      const ratio=cap&&cap.valueKn>0?demandKn/cap.valueKn:null;
      const status:AnchorStatus=!cap?"capacity-pending":demandKn<=1e-9?"no-demand":demandKn>cap.valueKn+1e-9?"exceeds-declared-capacity":"within-declared-capacity";
      return {demandKn,governingCombinationId:demandKn>1e-9?governing!.combinationId:null,declaredCapacity:cap,ratio,status,
        // A3: concurrent actions of the SAME combination (not envelope maxima of other combinations); informative only.
        concurrentHorizontalShearKn:demandKn>1e-9?governing!.horizontalShearKn:null,
        concurrentMomentKnM:demandKn>1e-9?governing!.momentKnM:null};
    };
    const pullout=check("pulloutKn",capacity(face.capacity?.upliftKn,type?.tensionDesignKn));
    const momentCombinationIds=per.filter(r=>r.momentKnM>1e-9).map(r=>r.combinationId);
    const compression={...check("compressionKn",capacity(face.capacity?.compressionKn,type?.compressionDesignKn??null)),
      note:"Compressão sobre a parede: demanda informada x capacidade declarada; resistência da alvenaria (NBR 16868) fica para o N10."};
    const issues=[
      ...(face.anchorTypeId&&!type?["ANCHOR_TYPE_MISSING: tipo "+face.anchorTypeId+" não declarado."]:[]),
      ...(pullout.status==="capacity-pending"?["ANCHOR_CAPACITY_PENDING: declare a capacidade de cálculo à tração (ficha do fabricante) para "+face.nodeId+"."]:[]),
      // A5: a type catalogue value may be PER ANCHOR, while the reaction is PER SUPPORT.
      // Without a typed, engineer-reviewed basis and group distribution, never show an OK for this comparison.
      ...(pullout.declaredCapacity?.origin==="anchor-type"?["ANCHOR_CAPACITY_SCOPE_PENDING: capacidade do tipo não distingue chumbador individual de conjunto do apoio; exigir definição e revisão profissional."]:[]),
      ...(!validULS?["ANCHOR_ULS_COMBINATIONS_UNVERIFIED: nenhuma envoltória ELU completa e rastreada; não emitir demanda, razão nem comparação como ELU. "+
        (missingResults.length?"Resultados ausentes: "+missingResults.join(", ")+". ":"")+
        (nonULS.length?"Finalidade incompatível: "+nonULS.join(", ")+".":"")]:[]),
      ...(face.reviewStatus!=="site-reviewed"?["EXISTING_SUPPORT_PENDING: parede existente sem inspeção registrada."]:[]),
      ...(favorableSet==="missing"?["ANCHOR_FAVORABLE_PERMANENT_SET_MISSING: falta combinar permanentes com o γg favorável de referência (NBR 8681 5.1.3.1; Tabelas 1 a 3) com cada hipótese variável considerada, incluindo a sucção. Verifique ELU: "+
        [...new Set(missingFavorableCombinationIds)].join(", ")+"."]:
        favorableSet==="unverified"?["ANCHOR_FAVORABLE_PERMANENT_SET_UNVERIFIED: fatores e cobertura das combinações ELU não confirmados; o arrancamento com permanente mínimo não foi verificado."]:[]),
      ...(validULS&&ec&&!classificationVerified?["ANCHOR_PERMANENT_CLASSIFICATION_UNVERIFIED: sem classificação NBR 8681 rastreável (Tabelas 1 a 3) para "+
        (unclassified.size?[...unclassified].join(", "):"as ações permanentes")+"; γg de referência desconhecido, conjuntos favorável e desfavorável não verificados."]:[]),
      ...(unfavorableSet==="missing"?["ANCHOR_UNFAVORABLE_PERMANENT_SET_MISSING: falta combinar cada permanente com o seu γg desfavorável de referência (NBR 8681 5.1.3.1; Tabelas 1 a 3) em cada hipótese variável; se a permanente tracionar o apoio, o arrancamento fica subestimado. Verifique ELU: "+
        [...new Set(missingUnfavorableCombinationIds)].join(", ")+"."]:[]),
      ...(pullout.demandKn!==null&&pullout.demandKn>1e-9&&(pullout.concurrentHorizontalShearKn??0)>1e-9?
        ["ANCHOR_SHEAR_INTERACTION_PENDING: tração e cisalhamento concomitantes da ELU "+pullout.governingCombinationId+
         "; interação não verificada, não aprovar apoio."]:[]),
      ...(momentCombinationIds.length?["ANCHOR_REACTION_MOMENT_PENDING: momento de reação em "+momentCombinationIds.join(", ")+" sem verificação no chumbador."]:[]),
    ];
    return {nodeId:face.nodeId,side:face.side,kind:face.kind,reviewStatus:face.reviewStatus,pullout,compression,issues,critical:false};
  });
  const ratios=supports.map(s=>s.pullout.ratio??-1),maxRatio=Math.max(-1,...ratios);
  for(const s of supports)s.critical=s.pullout.status==="exceeds-declared-capacity"||s.pullout.status==="capacity-pending"||
    s.issues.length>0||(maxRatio>0&&s.pullout.ratio===maxRatio);
  const governing=supports.filter(s=>s.pullout.ratio!==null).sort((a,b)=>b.pullout.ratio!-a.pullout.ratio!)[0]??null;
  return {schema_version:"jpn.anchor-pullout/1" as const,combinationsConsidered:uls,
    combinationPurposeDeclared:validULS,favorablePermanentSet:favorableSet,favorableCombinationIds,
    missingFavorableCombinationIds,unfavorablePermanentSet:unfavorableSet,missingUnfavorableCombinationIds,
    permanentClassificationVerified:classificationVerified,unclassifiedPermanents:[...unclassified],supports,
    governingSupport:governing?{nodeId:governing.nodeId,ratio:governing.pullout.ratio,combinationId:governing.pullout.governingCombinationId}:null,
    studioStatus:Object.fromEntries(supports.map(s=>[s.nodeId,s.pullout.status==="exceeds-declared-capacity"?"exceeds":s.pullout.status==="capacity-pending"||s.issues.length?"pending":s.critical?"governing":"ok"])) as Record<string,"exceeds"|"pending"|"governing"|"ok">,
    limitations:["Capacidades declaradas pelo engenheiro (ficha do fabricante); o JPN não calcula ancoragem nem alvenaria.",
      "Demanda no nó do modelo: distribuição entre chumbadores, excentricidade, efeito alavanca e borda não são verificados.",
      "Interação tração + cisalhamento no chumbador não verificada: o cisalhamento e o momento informados são os da combinação que governa a tração.",
      "Pendências do engenheiro: cpi mais nocivo para a sucção (NBR 6123 6.3.2.1); capacidade declarada por chumbador ou por apoio; tração no aço do chumbador (item da NBR 8800 a confirmar).",
      ...(!validULS?["Sem finalidade/cobertura ELU confirmada: nenhuma combinação ELS é considerada ELU; comparação bloqueada."]:[])],
    normativeApproval:false as const,computedStructuralApproval:false as const,fabricationRelease:false as const,releaseGate:"NOT_READY_BLOCKED" as const};
}
export type AnchorPulloutReport=ReturnType<typeof assessAnchorPullout>;