import { z } from "zod";
import { spatialPreparationSchema } from "./spatial-preparation";
import { declaredStructureSchema } from "./declared-structure";

const measure = z.number().finite().min(0).max(1000000).nullable();
export const workspaceSchema = z.object({
  cutting: z.object({ kerfMm: measure, endTrimMm: measure, minimumRemnantMm: measure, useFabrication: z.boolean() }).strict(),
  fabrication: z.array(z.object({ pieceId: z.string().max(100), lengthMm: z.number().finite().positive().max(1000000), signature: z.string().max(100000), note: z.string().max(500) }).strict()).max(5000),
  spatialPreparation: spatialPreparationSchema.optional(),
  physicalStructure: declaredStructureSchema.optional(),
  analysis: z.object({
    signature: z.string().max(100000),
    supports: z.array(z.object({ node: z.string(), uxMm: z.number().finite().nullable(), uyMm: z.number().finite().nullable() }).strict()).max(200),
    loads: z.array(z.object({ node: z.string(), fxKn: z.number().finite().nullable(), fyKn: z.number().finite().nullable() }).strict()).max(1000),
    articulated: z.boolean(),
  }).strict().nullable(),
}).strict();
export type Workspace = z.infer<typeof workspaceSchema>;
export function emptyWorkspace(): Workspace { return { cutting: { kerfMm: null, endTrimMm: null, minimumRemnantMm: null, useFabrication: false }, fabrication: [], analysis: null }; }
