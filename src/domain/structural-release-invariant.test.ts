import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {expect, it} from "vitest";
import {scanReleaseContracts} from "../../tests/safety/release-contract-scan";
import {buildEngineReleaseGate} from "./engine-release-gate";
import {mixedReferenceProject} from "./examples/mixed-project";
import {m49GarageProject} from "./test-support/m49-garage-project";
import {declaredTakeoff} from "./declared-takeoff";

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? entry.name === "test-support" ? [] : files(p)
      : /\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p) ? [p] : [];
  });
}

it("keeps every current executable TS release contract blocked, including API, Studio, reports and restore", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "tests/safety/ts-release-producers.json"), "utf8")) as Record<string, Record<string, number>>;
  const inventory = new Map(files(path.join(root, "src")).map(file => [path.relative(root, file).replaceAll("\\", "/"), scanReleaseContracts(readFileSync(file, "utf8"), file)]));
  const invalid = [...inventory].flatMap(([file, occurrences]) => occurrences.filter(o => !o.valid).map(o => `${file}:${o.line}: ${o.field} must remain locked`));
  expect(invalid).toEqual([]);
  // Removing a current contract is a regression too, even when no 'true' remains.
  for (const [file, required] of Object.entries(manifest)) {
    const occurrences = inventory.get(file) ?? [];
    for (const [field, count] of Object.entries(required)) expect(occurrences.filter(o => o.field === field).length, `${file}: ${field}`).toBeGreaterThanOrEqual(count);
  }
});

it.each([
  "return {computedStructuralApproval: true}",
  "return {fabricationRelease: approved}",
  'return {releaseGate: "READY"}',
  "const schema={fabricationRelease:z.literal(true)}",
  "result.computedStructuralApproval = true",
  'result["fabricationRelease"] = true',
  "return {fabricationRelease}",
  "const schema={computed_structural_approval:z.literal(true),approved_for_fabrication:z.literal(true)}",
])("detects an attempted release: %s", source => {
  expect(scanReleaseContracts(source, "mutation.ts").some(o => !o.valid)).toBe(true);
});

for (const [name, makeProject] of [["mixed", mixedReferenceProject], ["garage", m49GarageProject]] as const) {
  for (const order of ["linear", "second-order"] as const) it(`${name}/${order}: numerical success and claimed review never release the gate`, () => {
    const project = makeProject();
    const gate = buildEngineReleaseGate(project, {
      physicalInput: order === "second-order" ? {analysis_order: order} : {},
      binding: {claimedApproval: true, professionalReview: "approved"},
      continuousDemands: {calculated: true}, wholePieceDeflections: {calculated: true}, serviceChecks: [],
    });
    expect(gate).toMatchObject({status: "NOT_READY_BLOCKED", computedStructuralApproval: false, fabricationRelease: false, professionalReview: "not-granted", legalResponsibility: "not-issued"});
    expect(gate.blocked.length).toBeGreaterThan(0);
  });
}

it("a complete quantity takeoff does not authorize fabrication", () => {
  expect(declaredTakeoff(m49GarageProject()).fabricationRelease).toBe(false);
});
