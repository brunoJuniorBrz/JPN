import { z } from "zod";
const positive=z.number().finite().positive().nullable();
export const resistancePreparationSchema=z.object({pieceId:z.string().min(1).max(100),family:z.enum(["rolled","welded","tubular","cold-formed"]).nullable(),fyMpa:positive,fuMpa:positive,bucklingYM:positive,bucklingZM:positive,lateralRestraintM:positive,
  source:z.string().max(1000),revision:z.string().max(1000),sectionProperties:z.record(z.string().max(80),positive),restraintDescription:z.string().max(1000),normativeReference:z.string().max(1000)}).strict();
export function resistanceDiagnostics(value:unknown){
  const parsed=resistancePreparationSchema.safeParse(value);
  if(!parsed.success)return {status:"not_verified" as const,approved:false as const,issues:["Cadastro resistente ausente ou inválido."]};
  const d=parsed.data,issues=["Verificação resistente não implementada: falta referência normativa integral, cláusulas auditadas e exemplos independentes."];
  for(const k of ["family","fyMpa","fuMpa","bucklingYM","bucklingZM","lateralRestraintM"] as const)if(d[k]===null)issues.push(`${k}: pendente.`);
  if(d.fyMpa!==null&&d.fuMpa!==null&&d.fuMpa<d.fyMpa)issues.push("fu menor que fy: declaração contraditória.");
  if(!d.source.trim()||!d.revision.trim()||!Object.values(d.sectionProperties).some(v=>v!==null)||!d.restraintDescription.trim())issues.push("Fontes, geometria resistente e contenções precisam de revisão.");
  return {status:"not_verified" as const,approved:false as const,issues};
}
