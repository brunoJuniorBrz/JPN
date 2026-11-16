import {z} from "zod";
import { NBR6123_EDITION,NBR6123_LABEL } from "./nbr6123-edition";

/** INT-1d: normative sources/editions that are not yet unified are INTEGRATED but marked PROVISIONAL, with
 * edition and origin recorded. The mark is visible in the UI and in the resistance report; it never grants approval. */
export const normativeProvenanceSchema=z.object({
  id:z.enum(["wind-walls-nbr6123","combinations-nbr8681"]),
  normativeStatus:z.literal("PROVISIONAL"),
  standard:z.string().min(3).max(100),edition:z.string().min(3).max(200),
  /** File and revision (or hash) the coefficients came from. */
  origin:z.string().min(3).max(500),
  reason:z.string().min(10).max(1000),
}).strict();
export type NormativeProvenance=z.infer<typeof normativeProvenanceSchema>;
export const WIND_PROVENANCE:NormativeProvenance={id:"wind-walls-nbr6123",normativeStatus:"PROVISIONAL",standard:"ABNT NBR 6123",edition:`${NBR6123_EDITION} (${NBR6123_LABEL})`,
  origin:"data/normas/nbr6123-2023-wall-cpe.json (Tabela 6 e 6.3.2/6.3.3) + data/normas/nbr6123-2023-speed.json",
  reason:"Edição única da NBR 6123 em todo o vento (velocidade, paredes, Cpi e cobertura), conferida contra a versão corrigida sem alteração de valores; revisão profissional e licença de publicação das tabelas pendentes."};
export const COMBINATIONS_PROVENANCE:NormativeProvenance={id:"combinations-nbr8681",normativeStatus:"PROVISIONAL",standard:"ABNT NBR 8681",edition:"2025",
  origin:"data/normas/nbr8681-2025-combinations.json (JSON público; o extrato SHA privado da main foi mantido sem uso)",
  reason:"A fonte única dos fatores ELU/ELS da NBR 8681 ainda não está unificada entre o JSON público e o extrato validado por SHA."};
export function withProvenance(list:readonly NormativeProvenance[]|undefined,item:NormativeProvenance){
  return [...(list??[]).filter(x=>x.id!==item.id),item];
}
/** Visible text for every provisional source recorded in a project. */
export function provisionalNotices(list:readonly NormativeProvenance[]|undefined){
  return (list??[]).map(p=>`PROVISÓRIO — ${p.standard} ${p.edition}: ${p.reason} Origem: ${p.origin}.`);
}
