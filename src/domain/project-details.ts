import { z } from "zod";
import { profileSchema } from "./structure";

const text = z.string().trim().max(200);
export const units = ["un", "m", "m²", "kg", "barra"] as const;
export const materialCategories = ["Perfis metálicos", "Tubos", "Vigas", "Chapas", "Telhas metálicas", "Telhas termoacústicas", "Parafusos e fixadores", "Soldagem", "Pintura e acabamento", "Outros"] as const;
const measure = z.number().finite().positive().max(1000).nullable();
export const percent = z.number().finite().min(0).max(100).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7, "Use até duas casas decimais.");
export const money = z.number().int().min(0).max(10000000000).nullable();
export const quantity = z.number().finite().min(0).max(1000000).nullable();
export const roofSchema = z.object({
  widthM: measure, lengthM: measure, lowHeightM: measure,
  slopePercent: percent.nullable(),
  fall: z.enum(["width-positive", "width-negative", "length-positive", "length-negative"]),
  profileDescription: z.string().max(2000),
  supports: z.array(z.object({ id: z.uuid(), xM: z.number().finite().min(0).max(1000).nullable(), yM: z.number().finite().min(0).max(1000).nullable() }).strict()).max(200),
  revision: z.number().int().nonnegative(),
}).strict();
export type RoofParameters = z.infer<typeof roofSchema>;
export function emptyRoof(): RoofParameters { return { widthM: null, lengthM: null, lowHeightM: null, slopePercent: null, fall: "width-positive", profileDescription: "", supports: [], revision: 0 }; }
export const materialSchema = z.object({
  id: z.uuid(), name: text.min(1), code: text, category: text.min(1),
  purchaseUnit: z.enum(units), measurementUnit: z.enum(units),
  measurementPerPurchase: z.number().finite().positive().max(1000000).nullable(),
  unitPriceCents: money,
  supplier: text, notes: z.string().max(5000), updatedAt: z.iso.datetime(), isExample: z.boolean(),
  technicalProfile: profileSchema.optional(),
}).strict();
export type Material = z.infer<typeof materialSchema>;
export const materialLineSchema = z.object({
  id: z.uuid(), materialId: z.uuid().nullable(), name: text.min(1),
  purchaseUnit: z.enum(units), measurementUnit: z.enum(units),
  measurementPerPurchase: z.number().finite().positive().max(1000000).nullable(),
  source: z.enum(["manual", "roof-area", "slope-length", "support-count", "takeoff"]),
  quantityOrigin: z.object({ signature: z.string().max(100000), role: z.string().max(40), pieceIds: z.array(z.string()).max(5000) }).strict().optional(),
  manualQuantity: quantity, wastePercent: percent.nullable(), unitPriceCents: money,
}).strict();
export type MaterialLine = z.infer<typeof materialLineSchema>;
export const costLineSchema = z.object({ id: z.uuid(), description: text, quantity, unit: text, unitPriceCents: money }).strict();
export type CostLine = z.infer<typeof costLineSchema>;
export const chargeSchema = z.object({ id: z.uuid(), description: text, percent: percent.nullable(), basis: z.enum(["cost", "sale"]) }).strict();
export type Charge = z.infer<typeof chargeSchema>;
export const estimateSchema = z.object({
  materials: z.array(materialLineSchema).max(500), labor: z.array(costLineSchema).max(200), expenses: z.array(costLineSchema).max(200),
  charges: z.array(chargeSchema).max(100),
  pricingMode: z.enum(["markup", "margin"]), pricingPercent: z.number().finite().min(0).max(1000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7, "Use até duas casas decimais.").nullable(),
  deadline: z.string().max(500),
  paymentTerms: z.string().max(2000).default(""),
  validity: z.string().max(500).default(""),
  exclusions: z.string().max(2000).default(""),
}).strict();
export type Estimate = z.infer<typeof estimateSchema>;
export function emptyEstimate(): Estimate { return { materials: [], labor: [], expenses: [], charges: [], pricingMode: "markup", pricingPercent: 0, deadline: "", paymentTerms: "", validity: "", exclusions: "" }; }
