import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {afterAll, expect, it, vi} from "vitest";
import {compareValue, numericAt, runValidationCase, validationCaseSchema} from "../../../tests/validation/runner";

const cases = readdirSync("tests/validation/cases").filter(f => f.endsWith(".case.json")).sort();
if (!cases.length) throw Error("VALIDATION_CASES_REQUIRED: empty campaign must not pass");
const specs = cases.map(f => validationCaseSchema.parse(JSON.parse(readFileSync(path.join("tests/validation/cases", f), "utf8"))));
if (new Set(specs.map(s => s.id)).size !== specs.length) throw Error("DUPLICATE_CASE_ID");
afterAll(() => vi.unstubAllEnvs());

it.each(cases)("independent structural reference: %s", async filename => {
  vi.stubEnv("NODE_ENV", "development");vi.stubEnv("JPN_LOCAL_MIXED_ENABLED", "1");vi.stubEnv("JPN_LOCAL_MIXED_ORIGIN", "http://127.0.0.1:3000");
  const evidence = await runValidationCase(path.join("tests/validation/cases", filename));
  mkdirSync(".tools/validation-campaign", {recursive: true});
  writeFileSync(path.join(".tools/validation-campaign", `${evidence.caseId}.json`), JSON.stringify(evidence, null, 2));
  expect(evidence.checks.filter(c => !c.passed), JSON.stringify(evidence.checks)).toEqual([]);
  expect(evidence.passed).toBe(true);
  expect(evidence).toMatchObject({computedStructuralApproval: false, fabricationRelease: false, releaseGate: "NOT_READY_BLOCKED"});
}, 25000); // The worker's existing 20 s limit remains unchanged.

it("fails missing/nonfinite quantities and cannot treat an absent result as zero", () => {
  for (const result of [{}, {x: null}, {x: "0"}, {x: Infinity}]) expect(() => numericAt(result, "/x")).toThrow();
  expect(() => numericAt({}, "/__proto__/x")).toThrow();
  expect(numericAt({"W/1": {"a~b": 2}}, "/W~11/a~0b")).toBe(2);
});

it("uses declared absolute plus relative tolerance, including signed and zero references", () => {
  expect(compareValue(-100.009, -100, {absolute: .001, relative: .0001}).passed).toBe(true);
  expect(compareValue(-100.02, -100, {absolute: .001, relative: .0001}).passed).toBe(false);
  expect(compareValue(.0001, 0, {absolute: .00001, relative: .01}).passed).toBe(false);
  expect(() => compareValue(NaN, 0, {absolute: 1, relative: 0})).toThrow();
  expect(() => compareValue(0, 0, {absolute: -1, relative: 0})).toThrow();
  expect(() => compareValue(1e308, -1e308, {absolute: 1, relative: 1e308})).toThrow();
});

it("rejects an unspecified tolerance or unsafe project path", () => {
  const spec = specs[0];
  expect(validationCaseSchema.safeParse({...spec, projectFile: "../outside.project.json"}).success).toBe(false);
  expect(validationCaseSchema.safeParse({...spec, checks: spec.checks.map(c => ({...c, tolerance: {absolute: 0, relative: 0}}))}).success).toBe(false);
  expect(validationCaseSchema.safeParse({...spec, checks: []}).success).toBe(false);
  expect(validationCaseSchema.safeParse({...spec, checks: [spec.checks[0], spec.checks[0]]}).success).toBe(false);
});
