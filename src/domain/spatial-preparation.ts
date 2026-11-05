import { z } from "zod";
import { loadingDraftSchema } from "./structural-loading";
import { resistancePreparationSchema } from "./resistance-preparation";
import { physicalGroupSchema, emptyPhysicalGroup,type PhysicalGroup } from "./physical-declaration";
export { physicalGroupSchema, emptyPhysicalGroup } from "./physical-declaration";
export type { PhysicalGroup } from "./physical-declaration";
import type { Project } from "./models";
import type { PhysicalGeometry } from "./structure";
import { resolvePhysicalStructure } from "./physical-structure";
import { physicalCatalogSchema,resolveMemberPhysical } from "./member-physical";
import { structureSignature } from "./calculations/project-basis";
import { spatialContacts } from "./spatial-readiness";
import { connectivityDeclarationSchema } from "./spatial-connectivity";
import { roofRegionsSchema } from "./roof-regions";
import { engineeringCombinationsSchema } from "./engineering-combinations";
import { connectionsSchema } from "./connections";
import { declaredServiceCriterionSchema } from "./declared-service";
import { memberDesignDeclarationSchema } from "./coldformed-design";

// Human declarations, NOT finite-element input. A pending field is never
// translated to zero, a free support or a material property by default.
const meaningful = z.string().max(1000);
const signed = z.number().finite().min(-1e9).max(1e9).nullable();
const choice = z.enum(["pending", "fixed", "free"]);
export const dofNames = ["UX", "UY", "UZ", "RX", "RY", "RZ"] as const;
export const pieceRoles = ["column", "topChord", "bottomChord", "web", "purlin"] as const;
export const connectionChoices = ["pending", "rigid", "pinned", "axial"] as const;
const supportSchema = z.object({ nodeId: z.string().min(1).max(100), dofs: z.tuple([choice, choice, choice, choice, choice, choice]) }).strict();
const loadSchema = z.object({
  id: z.string().uuid(), caseId: z.string().min(1).max(40), nodeId: z.string().min(1).max(100),
  fxKn: signed, fyKn: signed, fzKn: signed, mxKnm: signed, myKnm: signed, mzKnm: signed,
}).strict();
export const spatialPreparationSchema = z.object({
  version: z.literal(1), geometrySignature: z.string().max(100000),
  physicalCatalog: physicalCatalogSchema.optional(),
  groups: z.object({ column: physicalGroupSchema, topChord: physicalGroupSchema, bottomChord: physicalGroupSchema, web: physicalGroupSchema, purlin: physicalGroupSchema }).strict(),
  supports: z.array(supportSchema).max(200),
  memberConnections: z.array(z.object({ pieceId: z.string().min(1).max(100), start: z.enum(["inherit", ...connectionChoices]), end: z.enum(["inherit", ...connectionChoices]) }).strict()).max(5000),
  cases: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/), source: meaningful }).strict()).max(10),
  loads: z.array(loadSchema).max(500),
  combinations: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/), factors: z.record(z.string().max(40), z.number().finite().min(-100).max(100).nullable()) }).strict()).max(10),
  connectionsReview: meaningful, lateralSystem: meaningful, loadPathReview: meaningful,
  connectivity: connectivityDeclarationSchema.optional(),
  memberKinds: z.array(z.object({ pieceId: z.string().min(1).max(100), kind: z.enum(["frame", "axial"]) }).strict()).max(5000).optional(),
  loading: loadingDraftSchema.optional(),
  roofRegions:roofRegionsSchema.optional(),
  resistance: z.array(resistancePreparationSchema).max(5000).optional(),
  engineeringCombinations: engineeringCombinationsSchema.optional(),
  connections: connectionsSchema.optional(),
  serviceCriteria:z.array(declaredServiceCriterionSchema).max(500).optional(),
  memberDesign:z.array(memberDesignDeclarationSchema).max(1000).refine(items=>new Set(items.map(d=>JSON.stringify([d.pieceId,d.combinationId]))).size===items.length,"Estudos resistentes duplicados para a mesma peça e combinação.").optional(),
}).strict();
export type SpatialPreparation = z.infer<typeof spatialPreparationSchema>;
export type PhysicalLoad = SpatialPreparation["loads"][number];

export function newSpatialPreparation(project: Pick<Project, "roof" | "planning"> & Partial<Pick<Project,"workspace">>): SpatialPreparation {
  return { version: 1, geometrySignature: structureSignature(project),
    groups: { column: emptyPhysicalGroup(), topChord: emptyPhysicalGroup(), bottomChord: emptyPhysicalGroup(), web: emptyPhysicalGroup(), purlin: emptyPhysicalGroup() },
    supports: [], memberConnections: [], cases: [{ id: "CASO-1", source: "" }], loads: [],
    combinations: [{ id: "COMB-1", factors: { "CASO-1": null } }],
    connectionsReview: "", lateralSystem: "", loadPathReview: "" };
}
export function emptyPhysicalLoad(caseId: string, nodeId: string): PhysicalLoad {
  return { id: crypto.randomUUID(), caseId, nodeId, fxKn: null, fyKn: null, fzKn: null, mxKnm: null, myKnm: null, mzKnm: null };
}
export function baseNodeIds(model: PhysicalGeometry) {
  const ids = new Set(model.pieces.filter(p => p.role === "column").map(p => p.start));
  return model.nodes.filter(n => ids.has(n.id) && Math.abs(n.z) < 1e-6).map(n => n.id);
}
export function spatialPreparationReview(project: Project, draft: SpatialPreparation) {
  const issues: { code: string; message: string }[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  let geometry:PhysicalGeometry|null=null;
  try{geometry=resolvePhysicalStructure(project).model;}catch(e){add("GEOMETRY",e instanceof Error?e.message:String(e));}
  const declared=project.workspace.physicalStructure!==undefined;
  if(draft.roofRegions)add("COMPOSED_ROOF_PRELIMINARY","Regiões compostas são preliminares e ainda não analisáveis. O modelo retangular não as substitui.");
  const stale = draft.geometrySignature !== structureSignature(project);
  if (stale) add("STALE_GEOMETRY", "Medidas, distribuição ou perfis mudaram. Revise o cadastro e atualize o vínculo geométrico.");
  if (!geometry) add("GEOMETRY", "A geometria visual está incompleta.");
  const contacts = geometry ? spatialContacts(geometry) : [];
  if (contacts.length) add("TOPOLOGY", `Existem ${contacts.length} pendências de encontros e discretização. O motor precisará resolvê-las antes da análise da obra.`);
  const base = geometry&&!declared ? baseNodeIds(geometry) : [];
  const nodes = new Set(geometry?.nodes.map(n => n.id) ?? []);
  const assigned = new Set(draft.supports.map(s => s.nodeId));
  if (draft.supports.some(s => !nodes.has(s.nodeId))) add("ORPHAN_SUPPORT", "Há apoios referindo nós que não existem mais; revise os registros.");
  if (base.some(id => !assigned.has(id))) add("SUPPORTS", `Faltam declarações para ${base.filter(id => !assigned.has(id)).length} bases de pilares.`);
  if(declared&&!draft.supports.some(s=>s.dofs.some(d=>d==="fixed")))add("SUPPORTS","Estrutura declarada exige apoios explícitos; nenhum apoio foi presumido pela categoria da barra.");
  if (draft.supports.some(s => s.dofs.some(d => d === "pending"))) add("DOFS", "Existem graus de liberdade pendentes. Livre não é o mesmo que não informado.");
  if (new Set(draft.memberConnections.map(v => v.pieceId)).size !== draft.memberConnections.length) add("DUPLICATE_CONNECTION", "Peças com hipóteses de ligação duplicadas.");
  if (draft.memberConnections.some(v => !geometry?.pieces.some(p => p.id === v.pieceId))) add("ORPHAN_CONNECTION", "Há hipóteses de ligação individuais referindo peças que não existem mais.");
  if (draft.memberConnections.some(v => v.start === "pending" || v.end === "pending")) add("MEMBER_CONNECTION", "Há hipóteses individuais com extremidades ainda pendentes.");
  const properties:[string,PhysicalGroup][]=[];
  if(declared||draft.physicalCatalog){
    for(const piece of geometry?.pieces??[])try{properties.push([piece.id,resolveMemberPhysical(piece,draft).properties]);}catch(e){add("PHYSICAL_REFERENCE",String(e));}
  }else for(const role of pieceRoles)properties.push([role,draft.groups[role]]);
  for (const [role,p] of properties) {
    if (!p.steelGrade.trim() || !p.materialSource.trim() || !p.materialRevision.trim()
      || !p.sectionSource.trim() || !p.sectionRevision.trim()
      || [p.eGpa, p.gGpa, p.nu, p.areaCm2, p.iyCm4, p.izCm4, p.jCm4, p.rotationDeg].some(v => v === null)) {
      add("PROPERTIES", `${role}: material, seção ou orientação física ainda sem especificação rastreável.`);
    } else if (Math.abs(p.eGpa! / (2 * p.gGpa! * (1 + p.nu!)) - 1) > 0.001) {
      add("ISOTROPY", `${role}: E, G e coeficiente de Poisson são incompatíveis com o modelo isotrópico.`);
    }
    if (p.connection === "pending") add("CONNECTION", `${role}: comportamento das extremidades não declarado.`);
    if (p.connection === "axial") add("AXIAL", `${role}: barras axiais exigem o adaptador misto, ainda pendente no motor espacial.`);
  }
  if (!draft.connectionsReview.trim()) add("JOINT_REVIEW", "Descreva a revisão das ligações.");
  if (!draft.lateralSystem.trim()) add("LATERAL", "Informe o sistema de estabilidade lateral ou sua justificativa técnica.");
  if (!draft.loadPathReview.trim()) add("LOAD_PATH", "Descreva o caminho das ações até os apoios.");
  if (!draft.cases.length || draft.cases.some(c => !c.source.trim()) || new Set(draft.cases.map(c => c.id)).size !== draft.cases.length) add("CASES", "Identifique os casos e suas fontes sem presumir ações.");
  if (!draft.loads.length) add("LOADS", "Nenhuma carga nodal declarada.");
  if (new Set(draft.loads.map(l => l.id)).size !== draft.loads.length) add("DUPLICATE_LOADS", "Identificadores de cargas duplicados.");
  if (draft.loads.some(l => !nodes.has(l.nodeId) || !draft.cases.some(c => c.id === l.caseId) ||
     [l.fxKn, l.fyKn, l.fzKn, l.mxKnm, l.myKnm, l.mzKnm].some(v => v === null))) add("LOAD_VALUES", "Cargas com nó/caso inválido ou componente em branco; informe zero explicitamente.");
  if (!draft.combinations.length || draft.combinations.some(c => !Object.values(c.factors).some(v => v !== null && v !== 0)
      || Object.keys(c.factors).some(id => !draft.cases.some(d => d.id === id))
      || draft.cases.some(d => c.factors[d.id] === null || c.factors[d.id] === undefined))) add("COMBINATIONS", "Combinações com fatores faltantes ou inválidos.");
  // Complete *declarations* never imply an analyzable or approved physical model.
  // The topology adapter and engineering validation are separate future work.
  const declarationsComplete = !!geometry && !stale && issues.every(i => i.code === "TOPOLOGY");
  return { geometry, base, contacts, stale, issues, declarationsComplete, analysisReady: false as const };
}
