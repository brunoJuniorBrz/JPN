import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { adaptMixedProject } from "@/domain/mixed-adapter";
import { secondaryFixityShed, type ShedOptions } from "@/domain/test-support/secondary-fixity-project";
import { m51Project, m51SectionRequest } from "@/domain/test-support/m51-project";
import { applyCalculatedSection } from "@/domain/apply-calculated-section";
import { projectSchema } from "@/domain/models";
import { finishStructuralAssessment } from "@/domain/structural-assessment";
import { auditSecondaryFixity } from "@/domain/secondary-fixity";
import { runLocalMixed } from "./local-mixed-runner";
import { runLocalSection } from "./local-section-runner";
import { runLocalStructuralAssessment } from "./local-structural-assessment-runner";
import { counterfactualRefusal, runLocalSecondaryFixityAudit } from "./secondary-fixity-runner";
import { SolverFailure } from "./runner";

/** C2 inside the NORMAL analysis flow, with the real capped Python worker.
 * No stiffness, support or tolerance differs from the declared analysis. */
beforeAll(() => { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1"); vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000"); });
afterAll(() => vi.unstubAllEnvs());
const payload = (project: unknown) => JSON.stringify({ schema_version: "jpn.structural-assessment/1", project });
const failure = async (run: Promise<unknown>) => { try { await run; } catch (e) { if (e instanceof SolverFailure) return e; throw e; } throw Error("Expected a refusal"); };
const audit = async (options: ShedOptions) => { const project = secondaryFixityShed(options), prepared = await adaptMixedProject(project); return { project, prepared, run: () => runLocalSecondaryFixityAudit(project, prepared) }; };

it("DEPENDENT: the declared shed solves in equilibrium, yet the flow refuses it and publishes nothing", async () => {
  const shed = await audit({ purlinGroup: "rigid" });
  // The artificial stability is real in the FE sense: the declared model is accepted by the solver.
  const declared = await runLocalMixed(JSON.stringify(shed.prepared.request));
  if (declared.status !== "completed") throw Error("Declared model should solve");
  expect(declared.result.combinations.C.equilibrium.relative_residual).toBeLessThan(1e-8);
  const refused = await failure(shed.run());
  expect(refused.code).toBe("STABILITY_DEPENDS_ON_SECONDARY_FIXITY");
  expect(refused.message).toMatch(/mecanismo/);
  // Same verdict from the integrated HTTP-facing orchestration: no assessment object at all.
  expect((await failure(runLocalStructuralAssessment(payload(shed.project)))).code).toBe("STABILITY_DEPENDS_ON_SECONDARY_FIXITY");
}, 90000);

it("STABLE: declared axial bracing makes the shed independent of the presumed fixity; still not an approval", async () => {
  const shed = await audit({ purlinGroup: "rigid", braced: true }), verdict = await shed.run();
  expect(verdict).toMatchObject({ status: "independent-of-presumed-fixity", counterfactualExecuted: true, declaredMomentEnds: [],
    computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED" });
  expect(verdict.presumedEnds.map(e => e.pieceId)).toEqual(["P1", "P1", "P2", "P2"]);
}, 60000);

it("UNSTABLE: with real bending hinges on the purlins the solver itself refuses the declared model", async () => {
  const shed = await audit({ purlinGroup: "bending-pinned" });
  expect((await failure(runLocalMixed(JSON.stringify(shed.prepared.request)))).code).toBe("UNSTABLE");
  expect((await failure(runLocalStructuralAssessment(payload(shed.project)))).code).toBe("UNSTABLE");
}, 60000);

it("DECLARED: a per-piece moment connection is preserved, never released, and its capacity stays unverified", async () => {
  const shed = await audit({ purlinGroup: "bending-pinned", explicitRigidPurlins: true }), verdict = await shed.run();
  expect(verdict.status).toBe("no-presumed-fixity"); expect(verdict.counterfactualExecuted).toBe(false); expect(verdict.presumedEnds).toEqual([]);
  expect(verdict.declaredMomentEnds.map(e => [e.pieceId, e.end, e.nodeId, e.declaredConnection])).toEqual([["P1", "start", "T1", "rigid"], ["P1", "end", "T3", "rigid"], ["P2", "start", "T2", "rigid"], ["P2", "end", "T4", "rigid"]]);
  for (const end of verdict.declaredMomentEnds) expect(end).toMatchObject({ connectionCapacityVerified: false, rotationalStiffnessVerified: false });
  expect(verdict).toMatchObject({ computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED" });
}, 60000);

it("an executor failure during the counterfactual is never read as a physical verdict, and an unknown refusal blocks", async () => {
  const shed = await audit({ purlinGroup: "rigid" });
  for (const code of ["BUSY", "TIMEOUT", "CANCELLED", "UNAVAILABLE", "MEMORY_LIMIT", "INVALID_RESPONSE"]) expect(() => counterfactualRefusal(new SolverFailure(code, "x"))).toThrow(SolverFailure);
  expect(() => counterfactualRefusal(new Error("boom"))).toThrow("boom");
  expect(counterfactualRefusal(new SolverFailure("UNSTABLE", "x"))).toEqual({ completed: false, refusalCode: "UNSTABLE" });
  await expect(auditSecondaryFixity(shed.project, shed.prepared, async () => ({ completed: false, refusalCode: "ILL_CONDITIONED" }))).rejects.toThrow(/STIFFNESS_DEPENDS_ON_SECONDARY_FIXITY/);
  await expect(auditSecondaryFixity(shed.project, shed.prepared, async () => ({ completed: false, refusalCode: "SOMETHING_ELSE" }))).rejects.toThrow(/SECONDARY_FIXITY_AUDIT_INCONCLUSIVE/);
  await expect(auditSecondaryFixity(shed.project, shed.prepared, async () => { throw new SolverFailure("BUSY", "x"); })).rejects.toMatchObject({ code: "BUSY" });
}, 60000);

it("M51 regression: the integrated assessment carries the audit and cannot be assembled without it", async () => {
  const geometric = await runLocalSection(JSON.stringify(m51SectionRequest));
  const project = projectSchema.parse(await applyCalculatedSection(m51Project(), "V", m51SectionRequest, geometric.result));
  const result = await runLocalStructuralAssessment(payload(project));
  expect(result.secondaryFixity).toMatchObject({ schema_version: "jpn.secondary-fixity-verdict/1", status: "no-presumed-fixity", presumedEnds: [], declaredMomentEnds: [], releaseGate: "NOT_READY_BLOCKED" });
  expect(result.lateralTorsional.map(a => a.status)).toEqual(["CALCULATED_ELASTIC_REFERENCE", "CALCULATED_ELASTIC_REFERENCE", "CALCULATED_ELASTIC_REFERENCE", "BLOCKED"]);
  expect(result).toMatchObject({ computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED" });
  await expect(finishStructuralAssessment(project, {} as Parameters<typeof finishStructuralAssessment>[1], [], [])).rejects.toThrow(/SECONDARY_FIXITY_AUDIT_PENDING/);
}, 120000);
