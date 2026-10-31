import { z } from "zod";

const n = z.number().finite(), id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/).refine(v => !["constructor", "prototype"].includes(v));
const source = z.string().min(1).max(1000).refine(v => !!v.trim()), signed = n.min(-1e9).max(1e9);
const flags = z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]);
const vec = z.tuple([n, n, n]);
export const spatialRequestSchema = z.object({
  schema_version: z.literal("jpn.frame3d/1"), units: z.literal("SI"), theory: z.literal("linear-elastic-euler-bernoulli"),
  project: z.object({ id: source, revision: source, source }).strict(),
  nodes: z.array(z.object({ id, x_m: n.min(-10000).max(10000), y_m: n.min(-10000).max(10000), z_m: n.min(-10000).max(10000) }).strict()).min(2).max(250),
  materials: z.array(z.object({ id, e_pa: n.min(1).max(1e13), g_pa: n.min(1).max(1e13), nu: n.min(-.99).max(.499), source, revision: source }).strict()).min(1).max(50),
  sections: z.array(z.object({ id, area_m2: n.min(1e-16).max(1000), iy_m4: n.min(1e-16).max(1000), iz_m4: n.min(1e-16).max(1000), j_m4: n.min(1e-16).max(1000), source, revision: source }).strict()).min(1).max(50),
  members: z.array(z.object({ id, start: id, end: id, kind: z.literal("frame"), material: id, section: id, rotation_deg: n.min(-360).max(360), release_start: flags, release_end: flags }).strict()).min(1).max(600),
  supports: z.array(z.object({ node: id, restrained: flags }).strict()).max(250),
  cases: z.array(z.object({ id, source }).strict()).min(1).max(10),
  nodal_loads: z.array(z.object({ node: id, case: id, fx_n: signed, fy_n: signed, fz_n: signed, mx_nm: signed, my_nm: signed, mz_nm: signed }).strict()).max(500),
  combinations: z.array(z.object({ id, factors: z.record(id, n.min(-100).max(100)) }).strict()).min(1).max(10),
}).strict().superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const collection of [v.nodes, v.members, v.materials, v.sections, v.cases, v.combinations]) if (new Set(collection.map(x => x.id)).size !== collection.length) issue("IDs repetidos.");
  const nodes = new Set(v.nodes.map(x => x.id)), materials = new Set(v.materials.map(x => x.id)), sections = new Set(v.sections.map(x => x.id)), cases = new Set(v.cases.map(x => x.id));
  const edges = new Set<string>();
  for (const m of v.members) {
    if (!nodes.has(m.start) || !nodes.has(m.end) || m.start === m.end || !materials.has(m.material) || !sections.has(m.section)) issue(`${m.id}: referência inválida.`);
    const edge = [m.start, m.end].sort().join("|"); if (edges.has(edge)) issue("Barras duplicadas."); edges.add(edge);
    if ([...m.release_start.slice(0, 3), ...m.release_end.slice(0, 3)].some(Boolean)) issue("Liberações translacionais não implementadas.");
  }
  const supported = new Set<string>();
  for (const s of v.supports) { if (!nodes.has(s.node) || supported.has(s.node) || !s.restrained.some(Boolean)) issue("Apoio inválido ou repetido."); supported.add(s.node); }
  for (const l of v.nodal_loads) if (!nodes.has(l.node) || !cases.has(l.case)) issue("Carga com referência inválida.");
  for (const c of v.cases) if (!v.nodal_loads.some(l => l.case === c.id)) issue("Cada caso precisa de cargas explícitas.");
  for (const c of v.combinations) if (!Object.values(c.factors).some(Boolean) || Object.keys(c.factors).some(key => !cases.has(key))) issue("Combinação exige casos e coeficientes explícitos não nulos.");
  for (const m of v.materials) if (Math.abs(m.e_pa / (2 * m.g_pa * (1 + m.nu)) - 1) > .001) issue("E, G e nu incompatíveis com a hipótese isotrópica.");
});
export type SpatialRequest = z.infer<typeof spatialRequestSchema>;

const resultNode = z.object({ translation_m: vec, rotation_rad: vec, force_n: vec, moment_nm: vec }).strict();
const station = z.object({ x_m: n.nonnegative(), n_n: n, vy_n: n, vz_n: n, t_nm: n, my_nm: n, mz_nm: n }).strict();
export const spatialResultSchema = z.object({
  schema_version: z.literal("jpn.frame3d-result/1"), status: z.literal("analysis_completed_experimental"), units: z.literal("SI"),
  project: z.object({ id: source, revision: source, source }).strict(), input_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  solver: z.object({ name: z.literal("PyNiteFEA"), version: z.literal("3.2.1"), adapter: z.literal("jpn-frame3d/1") }).strict(),
  assumptions: z.array(z.string()).max(20), diagnostics: z.object({ free_dofs: n.int().nonnegative().max(1500), scaled_condition: n.min(1).max(1e10), elapsed_seconds: n.nonnegative() }).strict(),
  combinations: z.record(id, z.object({
    nodes: z.record(id, resultNode),
    members: z.record(id, z.object({ length_m: n.positive(), local_axes: z.tuple([vec, vec, vec]), end_actions_local: z.array(n).length(12), stations: z.array(station).length(5) }).strict()),
    equilibrium: z.object({ force_n: vec, moment_nm: vec, relative_residual: n.nonnegative().max(1e-8) }).strict(),
  }).strict()),
}).strict();
export type SpatialResult = z.infer<typeof spatialResultSchema>;

export function canonicalSpatialInput(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (typeof v === "number") { const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, v === 0 ? 0 : v, false); return { $f64: Array.from({ length: 8 }, (_, i) => bytes.getUint8(i).toString(16).padStart(2, "0")).join("") }; }
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return v;
  };
  return JSON.stringify(canonical(value));
}
export async function spatialInputHash(value: SpatialRequest): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSpatialInput(value)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

// Explicit boundary conversions; visual dimensions never become A/I/J.
export const spatialSI = { metres: (mm: number) => mm / 1000, area: (cm2: number) => cm2 * 1e-4, inertia: (cm4: number) => cm4 * 1e-8, modulus: (gpa: number) => gpa * 1e9, force: (kn: number) => kn * 1000, moment: (knm: number) => knm * 1000 };
