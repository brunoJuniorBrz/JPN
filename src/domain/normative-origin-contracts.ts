import { z } from "zod";
import { engineeringId,engineeringSource } from "./engineering-combinations";

const n=z.number().finite();
const range=z.tuple([n.nonnegative(),n.nonnegative()]).refine(([a,b])=>b>=a,"Invalid domain interval");
export const normativeSourceSchema=z.object({standard:engineeringSource,edition:engineeringSource,errata:engineeringSource,
  item:engineeringSource,domain:engineeringSource,transcriber:engineeringSource,documentSha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const source6123=z.union([
  normativeSourceSchema.extend({standard:z.literal("ABNT NBR 6123"),edition:z.literal("2023-original"),errata:z.literal("2025-not-verified")}),
  normativeSourceSchema.extend({standard:z.literal("ABNT NBR 6123"),edition:z.literal("2023-corrected-2025"),errata:z.literal("08.04.2025-partial-through-48")}),
]);
const source8681=normativeSourceSchema.extend({standard:z.literal("ABNT NBR 8681"),edition:z.literal("2025")});
const coefficient=<S extends z.ZodType>(source:S)=>z.object({value:n.min(-100).max(100),source}).strict();
const origin=z.enum(["OWNER_TRANSCRIPTION","TEST_ONLY_NOT_NORMATIVE"]);
export const openingsSchema=z.object({enclosure:z.literal("enclosed"),classification:engineeringId.refine(v=>!['unknown','pending','undeclared'].includes(v.toLowerCase())),dominantFace:z.enum(["none","x-negative","x-positive","y-negative","y-positive","roof"]),
  faceAreasM2:z.tuple([n.nonnegative(),n.nonnegative(),n.nonnegative(),n.nonnegative(),n.nonnegative()]),
  permeabilityPercent:n.min(0).max(100),volumeM3:n.positive(),source:engineeringSource,revision:engineeringSource,
}).strict();
export const normativeWindDataSchema=z.object({schema_version:z.literal("jpn.normative-wind-data/1"),revision:engineeringSource,origin,
  rows:z.array(z.object({id:engineeringId,source:source6123,
    domain:z.object({typology:z.enum(["mono","gable"]),fall:z.enum(["width-negative","width-positive","length-negative","length-positive"]),
      slopeDeg:n.min(0).lt(90),incidenceDeg:n.min(0).lt(360),widthM:range,lengthM:range,heightM:range,
      openings:openingsSchema.omit({source:true,revision:true}),selectionRule:z.literal("exact-row-no-interpolation"),
    }).strict(),
    zones:z.array(z.object({id:engineeringId,region:z.number().int().min(1).max(2),kind:z.enum(["edge","corner","interior"]),
      boundsFraction:z.tuple([n.min(0).max(1),n.min(0).max(1),n.min(0).max(1),n.min(0).max(1)]).refine(([a,b,c,d])=>c>a&&d>b),
      cpe:coefficient(source6123),
    }).strict()).min(1).max(32),
    cpiCases:z.array(z.object({id:engineeringId,coefficient:coefficient(source6123)}).strict()).min(1).max(4),
  }).strict()).min(1).max(128),
}).strict();
export const normativeActionSchema=z.object({caseId:engineeringId,category:z.enum(["permanent","variable","wind"]),
  exclusiveGroup:engineeringId.nullable(),factorClass:engineeringId,
}).strict();
export const normativeFactorsDataSchema=z.object({schema_version:z.literal("jpn.normative-factors-data/1"),revision:engineeringSource,origin,
  use:engineeringSource,source:source8681,
  recipes:z.array(z.object({id:engineeringId,purpose:z.enum(["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"]),
    source:source8681,leading:z.enum(["each-variable","none"]),leadingEffect:z.literal("unfavorable"),includePermanentOnly:z.boolean(),
  }).strict()).min(1).max(4),
  factors:z.array(z.object({factorClass:engineeringId,category:z.enum(["permanent","variable","wind"]),
    role:z.enum(["permanent","leading","accompanying","absent"]),effect:z.enum(["favorable","unfavorable"]),
    purpose:z.enum(["ULS","SLS-characteristic","SLS-frequent","SLS-quasi-permanent"]),
    gamma:coefficient(source8681).refine(v=>v.value>=0),psi:coefficient(source8681).refine(v=>v.value>=0&&v.value<=1),
  }).strict()).min(1).max(256),
}).strict();
export type NormativeWindData=z.infer<typeof normativeWindDataSchema>;
export type NormativeFactorsData=z.infer<typeof normativeFactorsDataSchema>;
export type NormativeAction=z.infer<typeof normativeActionSchema>;
export type NormativeSource=z.infer<typeof normativeSourceSchema>;
/** Applicability declarations are inputs, never evidence of structural approval. */
export const reviewedRoofScopeSchema=z.object({
  procedure:z.literal("6123-global-Ce-airtight/1"),
  axes:z.literal("b=+X;a=+Y;alpha0=+Y;alpha90=+X;alpha270=-X"),
  roofImpermeable:z.literal(true),effectivelyAirtight:z.literal(true),fixedWindows:z.literal(true),
  negligibleAccidentalWindowBreakage:z.literal(true),singleInternalPressure:z.literal(true),
  noRoofProjections:z.literal(true),noLanterns:z.literal(true),noSeparateCeilingPressure:z.literal(true),
  noNeighborAmplification:z.literal(true),staticPeriodAtMostOneSecond:z.literal(true),
  s3Group:z.literal(3),source:engineeringSource,revision:engineeringSource,
}).strict();
export type ProcedureState="SUPPORTED_VERIFIED"|"DECLARED_UNVERIFIED"|"BLOCKED_UNSUPPORTED";
