import {z} from "zod";
const text=z.string().trim().min(1).max(1000);
/** Explicit analytical hypothesis; no roof, brace or warping condition inferred. */
export const elasticLtbStudySchema=z.object({
  schema_version:z.literal("jpn.elastic-ltb-study/1"),pieceId:z.string().min(1).max(100),combinationId:z.string().min(1).max(40),
  procedure:z.literal("doubly-symmetric-I-uniform-moment-fork-free-warping"),
  span:z.literal("whole-original-member"),
  endWarping:z.tuple([z.enum(["free","restrained","unknown"]),z.enum(["free","restrained","unknown"])]),
  loadHeightFromShearCenterM:z.number().finite(),
  momentPattern:z.enum(["uniform-end-couples","other"]),
  source:text,revision:text,responsible:text,warpingBasis:text,
}).strict();
export const elasticLtbStudiesSchema=z.array(elasticLtbStudySchema).max(4).refine(
  v=>new Set(v.map(s=>JSON.stringify([s.pieceId,s.combinationId]))).size===v.length,"Duplicate LTB member/combination study");
export type ElasticLtbStudy=z.infer<typeof elasticLtbStudySchema>;
