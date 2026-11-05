import { z } from "zod";

export const engineeringId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/);
export const engineeringSource = z.string().min(1).max(1000).refine(s => !!s.trim());
export const engineeringReferenceSchema = z.object({
  standard: engineeringSource, edition: engineeringSource, clause: engineeringSource,
  source: engineeringSource, revision: engineeringSource, responsible: engineeringSource,
}).strict();
const scalar = z.number().finite();
export const engineeringCombinationsSchema = z.object({
  schema_version: z.literal("jpn.engineering-combinations/1"),
  normativeValidation: z.literal("pending-engineer-review"),
  actions: z.array(z.object({ caseId: engineeringId,
    category: z.enum(["permanent", "variable", "wind"]),
    exclusiveGroup: engineeringId.nullable(), reference: engineeringReferenceSchema,
  }).strict()).min(1).max(10),
  combinations: z.array(z.object({ id: engineeringId,
    purpose: z.enum(["ULS", "SLS-characteristic", "SLS-frequent", "SLS-quasi-permanent"]),
    hypothesis: engineeringSource, reference: engineeringReferenceSchema,
    terms: z.array(z.object({ caseId: engineeringId,
      gamma: scalar.min(0).max(100), psi: scalar.min(0).max(1),
      reference: engineeringReferenceSchema,
    }).strict()).min(1).max(10),
  }).strict()).min(1).max(10),
}).strict();
export type EngineeringCombinations = z.infer<typeof engineeringCombinationsSchema>;

/** Arithmetic and applicability checks for engineer-declared factors. This is
 * deliberately NOT a library of ABNT factors or a normative approval engine. */
export function compileEngineeringCombinations(value: unknown, caseIds: string[]) {
  const d = engineeringCombinationsSchema.parse(value);
  const fail = (message: string): never => { throw new Error(`ENGINEERING_COMBINATIONS: ${message}`); };
  const same = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
  if (!same(d.actions.map(a => a.caseId), caseIds)) fail("classifique cada caso existente uma única vez.");
  if (new Set(d.combinations.map(c => c.id)).size !== d.combinations.length) fail("IDs de combinações repetidos.");
  const combinations = d.combinations.map(c => {
    if (!same(c.terms.map(t => t.caseId), caseIds)) fail(`${c.id}: declare todos os fatores, inclusive os zeros.`);
    const factors = Object.fromEntries(c.terms.map(t => [t.caseId, t.gamma * t.psi]));
    if (!Object.values(factors).some(x => x > 0) || Object.values(factors).some(x => !Number.isFinite(x) || x > 100)) fail(`${c.id}: fatores fora do contrato físico.`);
    const active = d.actions.filter(a => factors[a.caseId] !== 0 && a.exclusiveGroup !== null);
    if (new Set(active.map(a => a.exclusiveGroup)).size !== active.length) fail(`${c.id}: hipóteses mutuamente exclusivas combinadas.`);
    return { id: c.id, factors };
  });
  return { schema_version: "jpn.engineering-combinations-trace/1" as const,
    approved: false as const, declaration: d, combinations };
}

export function verifyEngineeringCombinations(value: unknown, cases: {id: string}[], actual: {id: string; factors: Record<string, number | null>}[]) {
  const trace = compileEngineeringCombinations(value, cases.map(c => c.id));
  if (actual.length !== trace.combinations.length || trace.combinations.some(c => {
    const a = actual.find(x => x.id === c.id);
    return !a || Object.keys(a.factors).length !== cases.length || cases.some(k => a.factors[k.id] !== c.factors[k.id]);
  })) throw new Error("STALE_ENGINEERING_COMBINATIONS: combinações físicas diferem da declaração rastreável; revise ambas.");
  return trace;
}
