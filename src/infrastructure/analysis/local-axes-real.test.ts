import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { declaredBasis, legacyAxisAmbiguity, legacyOffsetDeg, type V3 } from "@/domain/local-axes";
import { zUpMixedResultSchema } from "@/domain/structural-loading";
import { runLocalMixed } from "./local-mixed-runner";
import { SolverFailure } from "./runner";

/** C1 through the REAL TypeScript executor and the REAL capped Python 3.12 /
 * PyNite 3.2.1 worker. References are closed-form Euler-Bernoulli solutions in
 * the DECLARED principal axes; none of them uses a basis from the solver. */
beforeAll(() => { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1"); vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000"); });
afterAll(() => vi.unstubAllEnvs());

const E = 200e9, A = 2e-3, IY = 8e-6, IZ = 1e-6, SOURCE = "C1 synthetic cantilever reference; not a site model";
// Tip force (N, global) and local-z line load (N/m), small enough for the weak axis of a rolled
// 5 m cantilever to stay inside the solver's unchanged linear-domain gate.
const F: V3 = [30, -20, -100], Q = -10;
type Bar = { direction: V3; roll: number };
// Horizontal, inclined, vertical, skewed in plan, reversed, and rolled members.
const allBars: Bar[] = ([[4, 0, 0], [-4, 0, 0], [0, 4, 0], [0, -4, 0], [0, 0, 4], [0, 0, -4], [4, 0, .8], [0, 4, .8], [0, -4, .8], [0, 4, -.8],
  [3, 2, .5], [-2.5, 3, -.6], [1, 2, 3], [0, 4, 6e-5], [2, -3, 0]] as V3[]).flatMap(direction => [0, 30, 90, -45].map(roll => ({ direction, roll })));

function model(version: 2 | 3, selected: Bar[]) {
  const member = (i: number, roll: number) => ({ id: `M${i}`, start: "A", end: `B${i}`, kind: "frame" as const, material: "S", section: "S", rotation_deg: roll, release_start: Array(6).fill(false), release_end: Array(6).fill(false) });
  return {
    schema_version: `jpn.mixed3d/${version}`, units: "SI", theory: "linear-elastic-frame-axial", project: { id: "C1-AXES", revision: "1", source: SOURCE },
    // A star of cantilevers from ONE fully fixed node: the fixed node has no free
    // DOF, so every member is an independent cantilever of the same connected model.
    nodes: [{ id: "A", x_m: 0, y_m: 0, z_m: 5 }, ...selected.map((b, i) => ({ id: `B${i}`, x_m: b.direction[0], y_m: b.direction[1], z_m: 5 + b.direction[2] }))],
    members: selected.map((b, i) => member(i, b.roll)),
    materials: [{ id: "S", e_pa: E, g_pa: E / 2.6, nu: .3, source: SOURCE, revision: "1" }],
    sections: [{ id: "S", area_m2: A, iy_m4: IY, iz_m4: IZ, j_m4: 1e-7, source: SOURCE, revision: "1" }],
    supports: [{ node: "A", restrained: Array(6).fill(true) }],
    cases: [{ id: "F", source: SOURCE }, { id: "Q", source: SOURCE }],
    nodal_loads: selected.map((_, i) => ({ node: `B${i}`, case: "F", fx_n: F[0], fy_n: F[1], fz_n: F[2], mx_nm: 0, my_nm: 0, mz_nm: 0 })),
    combinations: [{ id: "F", factors: { F: 1 } }, { id: "Q", factors: { Q: 1 } }],
    member_loads: selected.map((_, i) => ({ id: `q${i}`, member: `M${i}`, case: "Q", coordinate_system: "local", force_per_length_n_m: [0, 0, Q], source: SOURCE, revision: "1" })),
    self_weight: null, ...(version === 3 ? { local_axes: "jpn-z-up/1" } : {}),
  };
}
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const close = (actual: number[], expected: number[], scale: number) => actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1e-9 * scale));
async function analysed(request: unknown, mode: "analysis" | "connections" = "analysis") {
  const out = await runLocalMixed(JSON.stringify(request), mode);
  if (out.status !== "completed") throw Error("Expected a completed analysis");
  return out;
}
async function refusal(request: unknown) {
  try { await runLocalMixed(JSON.stringify(request)); } catch (e) { if (e instanceof SolverFailure) return e.code; throw e; }
  return null;
}

it.each([0, 30, 90, -45])("jpn.mixed3d/3, roll %d: horizontal, inclined, vertical and skewed members match the closed form in the DECLARED axes", async roll => {
  const bars = allBars.filter(b => b.roll === roll);
  const out = await analysed(model(3, bars), "connections");
  const result = zUpMixedResultSchema.parse(out.result);
  expect(result.solver.adapter).toBe("jpn-mixed3d/3");
  const sum = { force: [0, 0, 0], moment: [0, 0, 0], lineForce: [0, 0, 0], lineMoment: [0, 0, 0] };
  for (const [i, b] of bars.entries()) {
    const L = Math.hypot(...b.direction), [x, y, z] = declaredBasis([0, 0, 0], b.direction, b.roll);
    // Tip force: axial + bending about z (deflection along y, Iz) + bending about y (deflection along z, Iy).
    const tip = [0, 1, 2].map(k => dot(F, x) * L / (E * A) * x[k] + dot(F, y) * L ** 3 / (3 * E * IZ) * y[k] + dot(F, z) * L ** 3 / (3 * E * IY) * z[k]);
    const forced = result.combinations.F, scale = Math.hypot(...tip);
    close(forced.nodes[`B${i}`].translation_m, tip, scale);
    F.forEach((v, k) => sum.force[k] -= v); cross(b.direction, F).forEach((v, k) => sum.moment[k] -= v);
    // Local line load along the declared z: w = q L^4 / (8 E Iy), reaction -q L z, moment about declared y.
    const loaded = result.combinations.Q, w = Q * L ** 4 / (8 * E * IY);
    close(loaded.nodes[`B${i}`].translation_m, z.map(v => v * w), Math.abs(w));
    z.forEach((v, k) => sum.lineForce[k] -= Q * L * v); cross(x, z).forEach((v, k) => sum.lineMoment[k] -= Q * L * L / 2 * v);
    // The reported basis is the declared one (also enforced by the executor).
    result.local_axes.members[`M${i}`].global_to_local.forEach((row, r) => close(row, [x, y, z][r], 1));
    expect(result.local_axes.members[`M${i}`].declared_rotation_deg).toBe(b.roll);
    expect(out.joint_actions!.members[`M${i}`].global_to_local).toEqual(result.local_axes.members[`M${i}`].global_to_local);
  }
  // Conservation at the single support: R = -ΣF, M = -Σ(r × F); line loads along each DECLARED z.
  close(result.combinations.F.nodes.A.reaction_force_n, sum.force, bars.length * Math.hypot(...F));
  close(result.combinations.F.nodes.A.reaction_moment_nm, sum.moment, bars.length * Math.hypot(...F) * 6);
  close(result.combinations.Q.nodes.A.reaction_force_n, sum.lineForce, bars.length * Math.abs(Q) * 6);
  close(result.combinations.Q.nodes.A.reaction_moment_nm, sum.lineMoment, bars.length * Math.abs(Q) * 18);
  for (const combo of Object.values(result.combinations)) expect(combo.equilibrium.relative_residual).toBeLessThan(1e-8);
}, 60000);

it("/2 keeps its numbers where the orientation is unambiguous and is refused where it is not", async () => {
  const bars = allBars.filter(b => b.roll === 0);
  const safe = bars.filter(b => !legacyAxisAmbiguity(model(2, [b])).length), unsafe = bars.filter(b => legacyAxisAmbiguity(model(2, [b])).length);
  // Physical expectation, independent of the guard. -X is the same SECTION (180 degrees)
  // but its legacy local load would point the other way, so with a local load it is refused too.
  expect(safe.map(b => b.direction)).toEqual([[4, 0, 0], [0, 4, 0], [0, -4, 0], [0, 0, 4], [0, 0, -4], [4, 0, .8], [2, -3, 0]]);
  expect(unsafe.map(b => b.direction)).toEqual([[-4, 0, 0], [0, 4, .8], [0, -4, .8], [0, 4, -.8], [3, 2, .5], [-2.5, 3, -.6], [1, 2, 3], [0, 4, 6e-5]]);
  const globalOnly = { ...model(2, [{ direction: [-4, 0, 0], roll: 0 }]), member_loads: [], cases: [{ id: "F", source: SOURCE }], combinations: [{ id: "F", factors: { F: 1 } }] };
  expect(legacyAxisAmbiguity(globalOnly)).toEqual([]); expect(await refusal(globalOnly)).toBeNull();
  const legacy = await analysed(model(2, safe)), declared = await analysed(model(3, safe));
  for (const combo of ["F", "Q"]) for (const [i] of safe.entries()) for (const key of ["translation_m", "rotation_rad"] as const) {
    const a = legacy.result.combinations[combo].nodes[`B${i}`][key], b = declared.result.combinations[combo].nodes[`B${i}`][key];
    close(a, b, Math.max(1e-12, Math.hypot(...b)));
  }
  for (const b of unsafe) expect(await refusal(model(2, [b]))).toBe("AXIS_CONVENTION_AMBIGUOUS");
  expect(await refusal(model(2, bars))).toBe("AXIS_CONVENTION_AMBIGUOUS");
  // The refused legacy answer would have been physically different: 0.06 mm of level error turns the strong axis.
  expect(Math.abs(legacyOffsetDeg([0, 0, 0], [0, 4, 6e-5]))).toBeCloseTo(90, 6);
}, 120000);

it("/3 refuses a near-vertical member and an undeclared or unknown convention", async () => {
  expect(await refusal(model(3, [{ direction: [.01, 0, 4], roll: 0 }]))).toBe("AXIS_REFERENCE_NEAR_VERTICAL");
  const { local_axes: _removed, ...undeclared } = model(3, [allBars[0]]) as ReturnType<typeof model> & { local_axes: string };
  void _removed;
  expect(await refusal(undeclared)).toBe("INVALID_INPUT");
  expect(await refusal({ ...model(3, [allBars[0]]), local_axes: "pynite-y-up" })).toBe("INVALID_INPUT");
}, 60000);

it("the TypeScript transcription of the library's Y-up branches agrees with the installed PyNite and the Python guard", () => {
  // Deterministic sweep including the isclose() boundaries of each branch.
  const points: V3[] = [];
  let seed = 20261112; const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 * 2 - 1;
  for (let i = 0; i < 120; i++) points.push([random() * 8, random() * 8, random() * 8]);
  for (const tiny of [0, 1e-12, 1e-9, 1e-6, 6e-5]) for (const s of [1, -1])
    points.push([4, s * tiny, 0], [0, 4, s * tiny], [s * tiny, 4, 0], [0, s * tiny, 4], [4, 0, s * tiny], [s * tiny, 0, 4], [0, s * 4, .8], [3, s * 2, tiny]);
  const usable = points.filter(p => { const lean = Math.hypot(p[0], p[1]) / Math.hypot(...p); return lean <= 1e-9 || lean >= Math.sin(Math.PI / 180); });
  const script = "import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom jpn_structural.local_axes import offset_deg,legacy_axis_ambiguity\nout=[]\n"
    + "for p in json.load(sys.stdin):\n d=dict(nodes=[dict(id='A',x_m=0.,y_m=0.,z_m=0.),dict(id='B',x_m=p[0],y_m=p[1],z_m=p[2])],members=[dict(id='M',kind='frame',start='A',end='B',section='S')],sections=[dict(id='S',iy_m4=8e-6,iz_m4=1e-6)])\n"
    + " out.append([offset_deg((0.,0.,0.),p),legacy_axis_ambiguity(d)])\nprint(json.dumps(out))";
  const python = process.env.JPN_PYTHON_EXECUTABLE || path.resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const run = spawnSync(python, ["-I", "-X", "utf8", "-c", script, path.resolve("engine")], { input: JSON.stringify(usable), encoding: "utf8", timeout: 60000 });
  expect(run.status, run.stderr).toBe(0);
  const native = JSON.parse(run.stdout) as [number, string[]][];
  expect(native).toHaveLength(usable.length);
  for (const [i, p] of usable.entries()) {
    const delta = Math.abs(((legacyOffsetDeg([0, 0, 0], p) - native[i][0] + 540) % 360) - 180);
    expect(delta, JSON.stringify(p)).toBeLessThan(1e-9);
    expect(legacyAxisAmbiguity({ nodes: [{ id: "A", x_m: 0, y_m: 0, z_m: 0 }, { id: "B", x_m: p[0], y_m: p[1], z_m: p[2] }], members: [{ id: "M", kind: "frame", start: "A", end: "B", section: "S" }], sections: [{ id: "S", iy_m4: 8e-6, iz_m4: 1e-6 }] }), JSON.stringify(p)).toEqual(native[i][1]);
  }
}, 90000);
