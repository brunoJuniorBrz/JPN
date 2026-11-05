import { z } from "zod";
import { visualSectionSchema } from "./profile-section";

export const roles = ["column", "topChord", "bottomChord", "web", "purlin"] as const;
export type PieceRole = typeof roles[number];
export const roleLabels: Record<PieceRole, string> = { column: "Pilares", topChord: "Banzos superiores", bottomChord: "Banzos inferiores", web: "Diagonais e montantes", purlin: "Terças" };
const positive = z.number().finite().positive();
export const sectionDataSchema = z.object({
  kind: z.enum(["unspecified", "tube", "angle", "channel", "i", "other"]).default("unspecified"),
  dimensions: z.string().max(500).default(""),
  thicknessMm: positive.nullable().default(null), areaCm2: positive.nullable().default(null),
  elasticModulusGpa: positive.nullable().default(null), iyCm4: positive.nullable().default(null), izCm4: positive.nullable().default(null),
  origin: z.enum(["declared", "calculated"]).default("declared"),
  sourceDate: z.string().max(40).default(""), calculationReference: z.string().max(1000).default(""),
}).strict();
export const profileSchema = z.object({
  name: z.string().max(200), steelGrade: z.string().max(200),
  section: z.string().max(500), source: z.string().max(1000),
  massKgM: positive.max(10000).nullable(), stockLengthM: positive.max(100).nullable(),
  data: sectionDataSchema.optional(),
  visualSection: visualSectionSchema.optional(),
  pricePerMeterCents: z.number().int().min(0).max(10000000000).nullable().optional(),
}).strict();
export type ProfileSpec = z.infer<typeof profileSchema>;
export function emptyProfile(): ProfileSpec { return { name: "", steelGrade: "", section: "", source: "", massKgM: null, stockLengthM: null }; }
export const planningSchema = z.object({
  version: z.literal(1),
  frameSpacingM: positive.max(1000).nullable(),
  purlinSpacingM: positive.max(1000).nullable(),
  trussDepthM: positive.max(100).nullable(),
  panels: z.number().int().min(1).max(40).nullable(),
  profiles: z.object({ column: profileSchema, topChord: profileSchema, bottomChord: profileSchema, web: profileSchema, purlin: profileSchema }).strict(),
  specificationNotes: z.string().max(3000),
  typology: z.enum(["mono", "gable"]).default("mono"),
  overhangStartM: z.number().finite().min(0).max(20).nullable().default(0),
  overhangEndM: z.number().finite().min(0).max(20).nullable().default(0),
}).strict();
export type Planning = z.infer<typeof planningSchema>;
export function emptyPlanning(): Planning {
  return { version: 1, frameSpacingM: null, purlinSpacingM: null, trussDepthM: null, panels: null,
    profiles: { column: emptyProfile(), topChord: emptyProfile(), bottomChord: emptyProfile(), web: emptyProfile(), purlin: emptyProfile() }, specificationNotes: "", typology: "mono", overhangStartM: 0, overhangEndM: 0 };
}
export interface Node3D { id: string; x: number; y: number; z: number; }
export interface StructurePiece { id: string; role: PieceRole; start: string; end: string; lengthMm: number; profile: ProfileSpec; massKg: number | null; }
/** Shared geometry only: no fabricated roof metrics or visual section. */
export type PhysicalPiece = Pick<StructurePiece,"id"|"role"|"start"|"end"|"lengthMm">;
export interface PhysicalGeometry { units:"mm"; nodes:Node3D[]; pieces:PhysicalPiece[]; }
export interface MaterialGroup { key: string; role: PieceRole; profile: ProfileSpec; pieceIds: string[]; lengthMm: number; totalLengthM: number; massKg: number | null; }
export interface StructureModel {
  units: "mm"; nodes: Node3D[]; pieces: StructurePiece[]; groups: MaterialGroup[];
  frameCount: number; frameSpacingM: number; purlinRows: number; purlinSpacingM: number;
  projectedAreaM2: number; roofAreaM2: number; totalLengthM: number; knownMassKg: number; massComplete: boolean;
}
export interface StructureResult { model: StructureModel | null; pending: string[]; notes: string[]; }
