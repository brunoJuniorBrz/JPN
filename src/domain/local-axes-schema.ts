import {z} from "zod";

/** C1/INT-1a: the roll of each frame piece measured from the JPN Z-up reference `jpn-z-up/1`
 * (x start->end, y horizontal, z in the member's vertical plane). It is a REVIEWED declaration:
 * the legacy group roll (PyNite Y-up branches) is never reused, so old projects do not migrate silently. */
export const LOCAL_AXES_CONVENTION="jpn-z-up/1" as const;
const text=z.string().trim().min(5).max(1000);
export const localAxesReviewSchema=z.object({
  version:z.literal(1),convention:z.literal(LOCAL_AXES_CONVENTION),
  /** Signature of the physical geometry the roll was reviewed against; a geometry change invalidates it. */
  geometrySignature:z.string().min(1).max(100000),
  members:z.array(z.object({pieceId:z.string().min(1).max(100),rotationDeg:z.number().finite().min(-360).max(360),source:text,revision:text}).strict()).max(5000),
}).strict();
export type LocalAxesReview=z.infer<typeof localAxesReviewSchema>;

