import { z } from "zod";
import { canonicalSpatialInput, spatialRequestSchema } from "./spatial-analysis";

const n = z.number().finite(), id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/).refine(v => !["constructor", "prototype"].includes(v));
const source = z.string().min(1).max(1000).refine(v => !!v.trim());
const base = spatialRequestSchema.shape;
const axial = z.object({ id, start: id, end: id, kind: z.literal("axial"), e_pa: n.min(1).max(1e13), area_m2: n.min(1e-16).max(1000), source, revision: source }).strict();
export const mixedRequestObject = z.object({
  ...base, schema_version: z.literal("jpn.mixed3d/1"), theory: z.literal("linear-elastic-frame-axial"),
  nodes: z.array(base.nodes.element).min(2).max(150),
  members: z.array(z.discriminatedUnion("kind", [base.members.element, axial])).min(1).max(320),
  materials: z.array(base.materials.element).max(50), sections: z.array(base.sections.element).max(50),
  supports: z.array(base.supports.element).max(150), nodal_loads: base.nodal_loads.min(1),
}).strict();
export function validateMixedReferences(v: Omit<z.infer<typeof mixedRequestObject>, "schema_version">, ctx: z.RefinementCtx, distributedCases: string[] = []) {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const values of [v.nodes, v.members, v.materials, v.sections, v.cases, v.combinations]) if (new Set(values.map(x => x.id)).size !== values.length) issue("IDs duplicados.");
  const nodes = new Set(v.nodes.map(x => x.id)), cases = new Set(v.cases.map(c => c.id)), frameNodes = new Set<string>(), edges = new Set<string>();
  // Frame-only, truss-only and genuinely mixed topologies share a single
  // physical contract. Element types, DOFs and stability are never inferred.
  for (const m of v.members) {
    if (!nodes.has(m.start) || !nodes.has(m.end) || m.start === m.end) issue(`${m.id}: extremos inválidos.`);
    const edge = [m.start, m.end].sort().join("|"); if (edges.has(edge)) issue("Barras duplicadas."); edges.add(edge);
    if (m.kind === "frame") {
      frameNodes.add(m.start); frameNodes.add(m.end);
      if (!v.materials.some(a => a.id === m.material) || !v.sections.some(s => s.id === m.section)) issue(`${m.id}: material/seção ausente.`);
      if ([...m.release_start.slice(0, 3), ...m.release_end.slice(0, 3)].some(Boolean) || (m.release_start[3] && m.release_end[3])) issue(`${m.id}: liberações não suportadas.`);
    }
  }
  for (const m of v.materials) if (Math.abs(m.e_pa / (2 * m.g_pa * (1 + m.nu)) - 1) > .001) issue("E/G/ν incompatíveis.");
  const supported = new Set<string>();
  for (const s of v.supports) {
    if (!nodes.has(s.node) || supported.has(s.node) || !s.restrained.some(Boolean)) issue("Apoio inválido ou duplicado."); supported.add(s.node);
    if (!frameNodes.has(s.node) && s.restrained.slice(3).some(Boolean)) issue(`${s.node}: nó exclusivamente axial não tem rotações para restringir.`);
  }
  for (const l of v.nodal_loads) {
    if (!nodes.has(l.node) || !cases.has(l.case)) issue("Carga com nó/caso ausente.");
    if (!frameNodes.has(l.node) && [l.mx_nm, l.my_nm, l.mz_nm].some(Boolean)) issue(`${l.node}: nó exclusivamente axial não recebe momentos.`);
  }
  for (const c of v.cases) if (!distributedCases.includes(c.id) && !v.nodal_loads.some(l => l.case === c.id)) issue(`${c.id}: declare cargas explícitas, inclusive zeros.`);
  for (const c of v.combinations) if (!Object.values(c.factors).some(Boolean) || Object.keys(c.factors).some(k => !cases.has(k))) issue("Combinação inválida.");
}
export const mixedRequestSchema = mixedRequestObject.superRefine((v, ctx) => validateMixedReferences(v, ctx));
export type MixedRequest = z.infer<typeof mixedRequestSchema>;
const vec = z.tuple([n, n, n]);
const resultMember = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("axial"), axial_n: n, length_m: n.positive(), extension_m: n }).strict(),
  z.object({ kind: z.literal("frame"), length_m: n.positive(), end_actions_local: z.array(n).length(12) }).strict(),
]);
export const mixedResultSchema = z.object({
  schema_version: z.literal("jpn.mixed3d-result/1"), status: z.literal("analysis_completed_experimental"), units: z.literal("SI"), project: base.project,
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/), solver: z.object({ name: z.literal("PyNiteFEA"), version: z.literal("3.2.1"), adapter: z.literal("jpn-mixed3d/1") }).strict(),
  assumptions: z.array(z.string()).max(20), diagnostics: z.object({ free_dofs: n.int().min(0).max(900), scaled_condition: n.min(1).max(1e10), elapsed_seconds: n.nonnegative() }).strict(),
  combinations: z.record(id, z.object({
    nodes: z.record(id, z.object({ translation_m: vec, rotation_rad: vec, reaction_force_n: vec, reaction_moment_nm: vec, active_rotations: z.boolean() }).strict()),
    members: z.record(id, resultMember), equilibrium: z.object({ force_n: vec, moment_nm: vec, relative_residual: n.min(0).max(1e-8) }).strict(),
  }).strict()),
}).strict();
export type MixedResult = z.infer<typeof mixedResultSchema>;
export async function mixedInputHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSpatialInput(value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export function verifyMixedResult(request: Pick<MixedRequest,"project"|"nodes"|"members"|"combinations">, result: Pick<MixedResult,"project"|"input_sha256"|"combinations">, hash: string) {
  const same = (a: string[], b: string[]) => [...a].sort().join("|") === [...b].sort().join("|");
  if (result.input_sha256 !== hash || canonicalSpatialInput(result.project) !== canonicalSpatialInput(request.project) || !same(Object.keys(result.combinations), request.combinations.map(c => c.id))) throw new Error("Resposta não corresponde à revisão, hash ou combinações enviados.");
  const frameNodes = new Set(request.members.filter(m => m.kind === "frame").flatMap(m => [m.start, m.end]));
  for (const c of Object.values(result.combinations)) {
    if (!same(Object.keys(c.nodes), request.nodes.map(n => n.id)) || !same(Object.keys(c.members), request.members.map(m => m.id))) throw new Error("IDs da resposta não correspondem ao modelo físico.");
    for (const m of request.members) if (c.members[m.id].kind !== m.kind) throw new Error("Tipo físico incompatível na resposta.");
    for (const [id, node] of Object.entries(c.nodes)) if (node.active_rotations !== frameNodes.has(id) || (!node.active_rotations && (Math.max(...node.rotation_rad.map(Math.abs)) > 1e-12 || Math.max(...node.reaction_moment_nm.map(Math.abs)) > 1e-8))) throw new Error("Graus rotacionais incompatíveis na resposta.");
  }
}
export type MixedStation = { x_m:number;n_n:number;vy_n:number;vz_n:number;t_nm:number;my_nm:number;mz_nm:number;translation_local_m?:[number,number,number] };
export function mixedStations(member: z.infer<typeof resultMember> & {stations?:MixedStation[]}): MixedStation[] | null {
  if (member.kind !== "frame") return null; // No invented shear/moments for axial-only elements.
  if(member.stations)return member.stations;
  const a = member.end_actions_local;
  return [0, .25, .5, .75, 1].map(t => ({ x_m: t * member.length_m, n_n: -a[0], vy_n: -a[1], vz_n: -a[2], t_nm: -a[3], my_nm: -a[4] - t * member.length_m * a[2], mz_nm: -a[5] + t * member.length_m * a[1] }));
}
