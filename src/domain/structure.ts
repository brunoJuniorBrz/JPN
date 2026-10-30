import { z } from "zod";

export const roles = ["column", "topChord", "bottomChord", "web", "purlin"] as const;
export type PieceRole = typeof roles[number];
export const roleLabels: Record<PieceRole, string> = { column: "Pilares", topChord: "Banzos superiores", bottomChord: "Banzos inferiores", web: "Diagonais e montantes", purlin: "Terças" };
const positive = z.number().finite().positive();
export const profileSchema = z.object({
  name: z.string().max(200), steelGrade: z.string().max(200),
  section: z.string().max(500), source: z.string().max(1000),
  massKgM: positive.max(10000).nullable(), stockLengthM: positive.max(100).nullable(),
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
}).strict();
export type Planning = z.infer<typeof planningSchema>;
export function emptyPlanning(): Planning {
  return { version: 1, frameSpacingM: null, purlinSpacingM: null, trussDepthM: null, panels: null,
    profiles: { column: emptyProfile(), topChord: emptyProfile(), bottomChord: emptyProfile(), web: emptyProfile(), purlin: emptyProfile() }, specificationNotes: "" };
}
export interface Node3D { id: string; x: number; y: number; z: number; }
export interface StructurePiece { id: string; role: PieceRole; start: string; end: string; lengthMm: number; profile: ProfileSpec; massKg: number | null; }
export interface MaterialGroup { key: string; role: PieceRole; profile: ProfileSpec; pieceIds: string[]; lengthMm: number; totalLengthM: number; massKg: number | null; }
export interface StructureModel {
  units: "mm"; nodes: Node3D[]; pieces: StructurePiece[]; groups: MaterialGroup[];
  frameCount: number; frameSpacingM: number; purlinRows: number; purlinSpacingM: number;
  projectedAreaM2: number; roofAreaM2: number; totalLengthM: number; knownMassKg: number; massComplete: boolean;
}
export interface StructureResult { model: StructureModel | null; pending: string[]; notes: string[]; }
