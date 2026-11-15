import {z} from "zod";
/** Resistance standard chosen per piece: NBR 14762 (cold-formed, default) or NBR 8800 (I/H). */
export const resistanceStandardsSchema=z.array(z.object({pieceId:z.string().min(1).max(100),standard:z.enum(["NBR14762","NBR8800"])}).strict()).max(5000);
