import {z} from "zod";
/** Data-only contract. This module MUST NOT depend on structural geometry,
 * project model or adapters: structural-loading imports it at runtime. */
const evidence=z.string().trim().min(5).max(1000);
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
export const declaredFacadeTractionSchema=z.object({
  schema_version:z.literal("jpn.declared-facade-traction/1"),
  normativeValidation:z.literal("pending-engineer-review"),
  physicalSignature:z.string().min(1).max(100000),
  cases:z.array(z.object({
    id,incidenceDeg:z.number().finite().min(0).lt(360),
    reference:evidence,
    zones:z.array(z.object({
      facadeId:id,netPressurePa:z.number().finite().min(-1e6).max(1e6),
      source:evidence,revision:evidence,calculationBasis:evidence,
    }).strict()).min(1).max(32),
  }).strict()).min(1).max(10),
}).strict();
export type DeclaredFacadeTraction=z.infer<typeof declaredFacadeTractionSchema>;

