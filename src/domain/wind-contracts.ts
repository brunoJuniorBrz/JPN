import { z } from "zod";
import { engineeringId as id, engineeringSource as source, engineeringReferenceSchema as reference } from "./engineering-combinations";
import { windSpeedInputSchema } from "./wind-speed";
const n = z.number().finite();
const bounds = z.tuple([n,n,n,n]).refine(([a,b,c,d]) => c > a && d > b, "WIND_ZONE: retângulo degenerado.");

/** Pressures refer to roof SURFACE area. Positive net pressure acts inward;
 * negative pressure is suction along the outward (+Z) surface normal.
 * q is supplied, never derived from guessed air density or wind factors. */
export const windDeclarationSchema = z.object({
  schema_version: z.literal("jpn.wind-roof/1"),
  normativeValidation: z.literal("pending-engineer-review"),
  geometrySignature: z.string().min(1).max(100000),
  scope: z.literal("global-roof-only"),
  transmission: z.literal("simply-supported-sheeting-to-parallel-purlins"),
  building: z.object({
    location: source, basicVelocityMS: n.positive().max(150), velocityReference: reference,
    terrain: source, roughness: source, topography: source, factorsDescription: source,
    enclosure: z.literal("enclosed"), openingsDescription: source,
    internalPressureDescription: source, staticApplicability: source,
    loadPath: source, reference,
  }).strict(),
  cases: z.array(z.object({ id, incidenceDeg: n.min(0).lt(360),
    speedCalculation:windSpeedInputSchema.optional(),
    dynamicPressurePa: n.positive().max(1e6), reference,
    zones: z.array(z.object({ id, regionId: id, boundsM: bounds,
      kind: z.enum(["edge", "corner", "interior"]),
      externalCoefficient: n.min(-100).max(100), internalCoefficient: n.min(-100).max(100),
      reference,
    }).strict()).min(1).max(32),
  }).strict()).min(1).max(4),
}).strict();
export type WindDeclaration = z.infer<typeof windDeclarationSchema>;
