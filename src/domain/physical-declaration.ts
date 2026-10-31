import { z } from "zod";

// Traceable physical properties are independent of synthetic 3D display geometry.
const positive = z.number().finite().positive().max(1e12).nullable();
const meaningful = z.string().max(1000);
export const physicalGroupSchema = z.object({
  steelGrade: meaningful, materialSource: meaningful, materialRevision: meaningful,
  eGpa: positive, gGpa: positive, nu: z.number().finite().min(-.99).max(.499).nullable(),
  areaCm2: positive, iyCm4: positive, izCm4: positive, jCm4: positive,
  sectionSource: meaningful, sectionRevision: meaningful, rotationDeg: z.number().finite().min(-360).max(360).nullable(),
  connection: z.enum(connectionChoices),
}).strict();
export type PhysicalGroup = z.infer<typeof physicalGroupSchema>;

export function emptyPhysicalGroup(): PhysicalGroup {
  return { steelGrade: "", materialSource: "", materialRevision: "", eGpa: null, gGpa: null, nu: null,
    areaCm2: null, iyCm4: null, izCm4: null, jCm4: null, sectionSource: "", sectionRevision: "", rotationDeg: null, connection: "pending" };
}
