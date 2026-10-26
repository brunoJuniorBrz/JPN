import { z } from "zod";
import { emptyEstimate, emptyRoof, estimateSchema, materialSchema, roofSchema } from "./project-details";
export { materialSchema, units } from "./project-details";
export type { Material } from "./project-details";

export const categories = ["Cobertura metálica", "Galpão", "Barracão", "Mezanino", "Steel frame", "Drywall", "Outros"] as const;
export const statuses = ["Rascunho", "Em elaboração", "Finalizado", "Arquivado"] as const;
const shortText = z.string().trim().max(200, "Use até 200 caracteres.");
const notes = z.string().max(5000, "Use até 5.000 caracteres.");
const date = z.iso.datetime();
const projectBaseSchema = z.object({
  id: z.uuid(),
  name: shortText.min(1, "Informe o nome do projeto."),
  client: shortText.min(1, "Informe o nome do cliente."),
  phone: z.string().max(40, "Use até 40 caracteres."),
  location: shortText,
  description: notes,
  category: z.enum(categories),
  status: z.enum(statuses),
  createdAt: date,
  updatedAt: date,
  technicalNotes: notes,
  commercialNotes: notes,
  technicalContact: shortText,
  technicalStatus: z.literal("preliminary"),
}).strict();
export const projectSchema = projectBaseSchema.extend({
  roof: roofSchema, estimate: estimateSchema, isExample: z.boolean(),
});
export type Project = z.infer<typeof projectSchema>;
export const settingsSchema = z.object({
  companyName: shortText.min(1, "Informe o nome da empresa."),
  businessInfo: z.string().max(2000),
  defaultWastePercent: z.number().finite().min(0).max(100),
  pricingMode: z.enum(["markup", "margin"]),
  defaultPricingPercent: z.number().finite().min(0).max(1000),
  currency: z.literal("BRL"),
  compactView: z.boolean(),
}).strict().refine(s => s.pricingMode !== "margin" || s.defaultPricingPercent < 100, {
  message: "A margem sobre venda deve ser menor que 100%.", path: ["defaultPricingPercent"],
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = { companyName: "JPN Projetos", businessInfo: "", defaultWastePercent: 0, pricingMode: "markup", defaultPricingPercent: 0, currency: "BRL", compactView: false };
const legacyMaterialSchema = z.object({
  id: z.uuid(), name: shortText.min(1), code: shortText, category: shortText.min(1),
  purchaseUnit: z.enum(["un", "m", "m²", "kg", "barra"]), measurementUnit: z.enum(["un", "m", "m²", "kg", "barra"]),
  unitPriceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  supplier: shortText, notes, updatedAt: date,
}).strict();
const legacySnapshotSchema = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), projects: z.array(projectBaseSchema).max(10000), materials: z.array(legacyMaterialSchema).max(10000), settings: settingsSchema }).strict();
export const snapshotSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().nonnegative(),
  exampleInstalled: z.boolean().default(false),
  projects: z.array(projectSchema).max(10000),
  materials: z.array(materialSchema).max(10000),
  settings: settingsSchema,
}).strict().superRefine((data, ctx) => {
  for (const key of ["projects", "materials"] as const) {
    if (new Set(data[key].map(item => item.id)).size !== data[key].length)
      ctx.addIssue({ code: "custom", path: [key], message: "IDs duplicados no arquivo." });
  }
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export function migrateSnapshot(input: unknown): Snapshot {
  if (typeof input === "object" && input !== null && "version" in input && input.version === 1) {
    const old = legacySnapshotSchema.parse(input);
    return snapshotSchema.parse({ ...old, version: 2,
      projects: old.projects.map(p => ({ ...p, roof: emptyRoof(), estimate: { ...emptyEstimate(), pricingMode: old.settings.pricingMode, pricingPercent: Math.round(old.settings.defaultPricingPercent * 100) / 100 }, isExample: false })),
      materials: old.materials.map(m => ({ ...m, measurementPerPurchase: null, isExample: false })),
    });
  }
  return snapshotSchema.parse(input);
}
export const backupSchema = z.object({ format: z.literal("jpn-projetos-backup"), exportedAt: date, data: snapshotSchema }).strict();
export type Backup = z.infer<typeof backupSchema>;
export function emptySnapshot(): Snapshot { return { version: 2, revision: 0, exampleInstalled: false, projects: [], materials: [], settings: { ...defaultSettings } }; }
export function newProject(settings: Settings = defaultSettings): Project {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: "", client: "", phone: "", location: "", description: "", category: "Cobertura metálica", status: "Rascunho", createdAt: now, updatedAt: now, technicalNotes: "", commercialNotes: "", technicalContact: "", technicalStatus: "preliminary", roof: emptyRoof(), estimate: { ...emptyEstimate(), pricingMode: settings.pricingMode, pricingPercent: Math.round(settings.defaultPricingPercent * 100) / 100 }, isExample: false };
}
