/** C1 — JPN Z-up local axes on the TypeScript side of the mixed3d contract.
 *
 * `jpn-z-up/1` (same definition as engine/jpn_structural/local_axes.py):
 *   x      start -> end
 *   y_ref  unit(ez × x)       horizontal
 *   z_ref  x × y_ref          in the member's vertical plane, upward
 *   exactly vertical member:  y_ref = +Y global
 * The declared roll is a right-hand rotation of (y_ref, z_ref) about x.
 *
 * Two independent uses, neither of which changes any stiffness or tolerance:
 *  1. `verifyLocalAxes`: the basis the Python solver REPORTS for a /3 analysis
 *     is recomputed here from the request alone and must match. A response
 *     whose axes differ from the declaration is never published.
 *  2. `legacyAxisAmbiguity`: a /1 or /2 request whose physical section
 *     orientation would be decided by PyNite's Y-up branches (not by the
 *     declared roll) is refused BEFORE transport, so a remote backend that
 *     predates the Python guard cannot publish such a result either.
 */
export type V3 = [number, number, number];
export type Basis = [V3, V3, V3];
export const localAxesConvention = "jpn-z-up/1" as const;
export const EXACT_VERTICAL = 1e-9;
export const NEAR_VERTICAL = Math.sin(Math.PI / 180);
export const ANGLE_TOLERANCE_DEG = 1e-7;
export const BASIS_TOLERANCE = 1e-9;

export class LocalAxesError extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`); this.name = "LocalAxesError"; }
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a: V3): V3 => scale(a, 1 / norm(a));
/** Python's math.isclose(a, b) with its defaults (rel_tol=1e-9, abs_tol=0). */
const isclose = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

function unitX(a: V3, b: V3): V3 {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], length = norm(d);
  if (!(length > 0) || !Number.isFinite(length)) throw new LocalAxesError("INVALID_GEOMETRY", "Barra de comprimento nulo.");
  return scale(d, 1 / length);
}

/** Rows x, y_ref, z_ref in global coordinates for zero declared roll. */
export function referenceBasis(a: V3, b: V3, member = "barra"): Basis {
  const x = unitX(a, b), horizontal = cross([0, 0, 1], x), size = norm(horizontal);
  let y: V3;
  if (size <= EXACT_VERTICAL) y = [0, 1, 0];
  else if (size < NEAR_VERTICAL) throw new LocalAxesError("AXIS_REFERENCE_NEAR_VERTICAL", `${member}: a menos de 1 grau da vertical a referência horizontal é ambígua; modele a barra exatamente vertical ou revise a geometria.`);
  else y = scale(horizontal, 1 / size);
  return [x, y, unit(cross(x, y))];
}

/** Right-hand roll of rows y and z about row x (Rodrigues). */
export function rolled(basis: Basis, degrees: number): Basis {
  const x = basis[0], t = degrees * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const turn = (v: V3): V3 => { const k = cross(x, v), p = dot(x, v) * (1 - c); return [v[0] * c + k[0] * s + x[0] * p, v[1] * c + k[1] * s + x[1] * p, v[2] * c + k[2] * s + x[2] * p]; };
  return [x, turn(basis[1]), turn(basis[2])];
}
export const declaredBasis = (a: V3, b: V3, rotationDeg: number, member = "barra") => rolled(referenceBasis(a, b, member), rotationDeg);

/** Transcription of the zero-roll branches of PyNite 3.2.1 `Member3D.T()`
 * (Y-up world). It exists ONLY to detect legacy ambiguity before transport and
 * is cross-checked against the installed library through the real worker in
 * local-axes-real.test.ts. It never produces a stiffness or a result. */
export function pyniteZeroRollBasis(a: V3, b: V3): Basis {
  const x = unitX(a, b);
  let y: V3, z: V3;
  if (isclose(a[0], b[0]) && isclose(a[2], b[2])) { y = b[1] > a[1] ? [-1, 0, 0] : [1, 0, 0]; z = [0, 0, 1]; }
  else if (isclose(a[1], b[1])) { y = [0, 1, 0]; z = unit(cross(x, y)); }
  else {
    const projection: V3 = [b[0] - a[0], 0, b[2] - a[2]];
    z = unit(b[1] > a[1] ? cross(projection, x) : cross(x, projection));
    y = unit(cross(z, x));
  }
  return [x, y, z];
}
export const wrapDegrees = (degrees: number) => { const value = ((degrees + 180) % 360 + 360) % 360 - 180; return value === -180 ? 180 : value; };
/** Signed angle about x from PyNite's zero-roll y to the JPN y_ref. */
export function legacyOffsetDeg(a: V3, b: V3, member = "barra") {
  const native = pyniteZeroRollBasis(a, b), reference = referenceBasis(a, b, member);
  return Math.atan2(dot(native[0], cross(native[1], reference[1])), dot(native[1], reference[1])) * 180 / Math.PI;
}

type AxisNode = { id: string; x_m: number; y_m: number; z_m: number };
type AxisMember = { id: string; start: string; end: string; kind: "frame" | "axial"; section?: string; rotation_deg?: number };
type AxisSection = { id: string; iy_m4: number; iz_m4: number };
type AxisModel = { nodes: readonly AxisNode[]; members: readonly AxisMember[]; sections: readonly AxisSection[]; member_loads?: readonly { member: string; coordinate_system: string }[] };
const point = (n: AxisNode): V3 => [n.x_m, n.y_m, n.z_m];

/** Frame members of a /1 or /2 request whose PHYSICAL section orientation is
 * decided by PyNite's Y-up branches instead of the declared roll. Equal
 * principal inertias are unaffected; an offset of 0 or 180 degrees is the same
 * physical section. Same rule and thresholds as the Python guard.
 *
 * A member load declared in LOCAL coordinates is a direction, not a section:
 * there even a 180 degree offset reverses the physical load and equal inertias
 * do not help, so any nonzero offset is ambiguous for that member. */
export function legacyAxisAmbiguity(model: AxisModel): string[] {
  const nodes = new Map(model.nodes.map(n => [n.id, n])), sections = new Map(model.sections.map(s => [s.id, s])), found: string[] = [];
  const locallyLoaded = new Set((model.member_loads ?? []).filter(l => l.coordinate_system === "local").map(l => l.member));
  for (const m of model.members) {
    if (m.kind !== "frame") continue;
    const s = sections.get(m.section!), a = nodes.get(m.start), b = nodes.get(m.end);
    if (!s || !a || !b) throw new LocalAxesError("INVALID_INPUT", `${m.id}: seção ou nós ausentes.`);
    const section = !isclose(s.iy_m4, s.iz_m4), load = locallyLoaded.has(m.id);
    if (!section && !load) continue;
    const lean = norm(cross([0, 0, 1], unitX(point(a), point(b))));
    if (lean > EXACT_VERTICAL && lean < NEAR_VERTICAL) { found.push(m.id); continue; }
    const delta = Math.abs(legacyOffsetDeg(point(a), point(b), m.id));
    if (load ? delta > ANGLE_TOLERANCE_DEG : Math.min(delta, Math.abs(delta - 180)) > ANGLE_TOLERANCE_DEG) found.push(m.id);
  }
  return found;
}
export function refuseAmbiguousLegacyAxes(model: AxisModel) {
  const members = legacyAxisAmbiguity(model);
  if (members.length) throw new LocalAxesError("AXIS_CONVENTION_AMBIGUOUS", "Nos contratos mixed3d/1 e /2 a orientação física da seção (Iy diferente de Iz) ou de uma carga em eixos locais destas barras depende da direção global, não do giro declarado: "
    + members.slice(0, 8).join(", ") + (members.length > 8 ? "..." : "") + ". Declare a convenção de eixos 'jpn-z-up/1' (jpn.mixed3d/3) e revise o giro de cada peça.");
}

type ReportedAxes = { convention: string; members: Record<string, { declared_rotation_deg: number; reference_offset_deg: number; solver_rotation_deg: number; global_to_local: number[][] }> };
/** The basis the solver reports must be the one declared by the request,
 * recomputed here without any value from the response. Never repaired. */
export function verifyLocalAxes(request: AxisModel & { local_axes: string }, reported: ReportedAxes) {
  const fail = (message: string): never => { throw new LocalAxesError("AXIS_REALISATION_FAILED", message); };
  if (request.local_axes !== localAxesConvention || reported.convention !== localAxesConvention) fail("convenção de eixos ausente ou diferente da declarada.");
  const frames = request.members.filter(m => m.kind === "frame"), nodes = new Map(request.nodes.map(n => [n.id, n]));
  const ids = Object.keys(reported.members);
  if (ids.length !== frames.length || frames.some(m => !Object.hasOwn(reported.members, m.id))) fail("eixos informados não cobrem exatamente as barras de pórtico.");
  for (const m of frames) {
    const row = reported.members[m.id], a = point(nodes.get(m.start)!), b = point(nodes.get(m.end)!);
    if (row.declared_rotation_deg !== m.rotation_deg) fail(`${m.id}: giro declarado alterado na resposta.`);
    const expected = declaredBasis(a, b, m.rotation_deg!, m.id), used = row.global_to_local;
    if (used.length !== 3 || used.some(r => r.length !== 3)) fail(`${m.id}: base local malformada.`);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      if (!Number.isFinite(used[i][j]) || Math.abs(used[i][j] - expected[i][j]) > BASIS_TOLERANCE) fail(`${m.id}: a base local usada pelo solver difere da referência declarada; sem resultado.`);
    // Traceability of how the convention was realised through PyNite's own roll.
    const offset = legacyOffsetDeg(a, b, m.id), sent = wrapDegrees(m.rotation_deg! + offset);
    const angular = (x: number, y: number) => Math.abs(wrapDegrees(x - y));
    if (angular(row.reference_offset_deg, offset) > 1e-6 || angular(row.solver_rotation_deg, sent) > 1e-6) fail(`${m.id}: giro enviado ao solver não corresponde à referência declarada.`);
  }
}
