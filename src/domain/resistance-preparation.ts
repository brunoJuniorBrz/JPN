import { z } from "zod";
const positive=z.number().finite().positive().nullable();
export const resistantSectionGeometrySchema=z.object({
  version:z.literal(1),basis:z.literal("physical-engineer-declaration"),
  shape:z.enum(["u","u-stiffened","i","rhs","chs","angle","other"]),
  dimensionsMm:z.partialRecord(z.enum(["height","width","wallThickness","webThickness","flangeThickness","lip","insideRadius","diameter"]),z.number().finite().nonnegative().max(1e6).nullable()),
  source:z.string().min(1).max(1000).refine(s=>!!s.trim()),revision:z.string().min(1).max(1000).refine(s=>!!s.trim()),
}).strict();
export const resistancePreparationSchema=z.object({pieceId:z.string().min(1).max(100),family:z.enum(["rolled","welded","tubular","cold-formed"]).nullable(),fyMpa:positive,fuMpa:positive,bucklingYM:positive,bucklingZM:positive,lateralRestraintM:positive,
  source:z.string().max(1000),revision:z.string().max(1000),sectionProperties:z.record(z.string().max(80),positive),restraintDescription:z.string().max(1000),normativeReference:z.string().max(1000),
  profileDesignation:z.string().min(1).max(200).refine(s=>!!s.trim()).optional(),geometry:resistantSectionGeometrySchema.optional(),
}).strict();
export function resistanceDiagnostics(value:unknown){
  const parsed=resistancePreparationSchema.safeParse(value);
  if(!parsed.success)return {status:"not_verified" as const,approved:false as const,issues:["Cadastro resistente ausente ou inválido."]};
  const d=parsed.data,issues=["Verificação resistente não implementada: falta referência normativa integral, cláusulas auditadas e exemplos independentes."];
  for(const k of ["family","fyMpa","fuMpa","bucklingYM","bucklingZM","lateralRestraintM"] as const)if(d[k]===null)issues.push(`${k}: pendente.`);
  if(d.fyMpa!==null&&d.fuMpa!==null&&d.fuMpa<d.fyMpa)issues.push("fu menor que fy: declaração contraditória.");
  if(!d.source.trim()||!d.revision.trim()||!Object.values(d.sectionProperties).some(v=>v!==null)||!d.restraintDescription.trim())issues.push("Fontes, geometria resistente e contenções precisam de revisão.");
  return {status:"not_verified" as const,approved:false as const,issues};
}
