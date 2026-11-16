/** N1 (docs/PENDENCIAS-NORMATIVAS.md): one NBR 6123 edition for every wind procedure
 * (S1/S2/Vk/q, wall Cpe, Cpi and the reviewed roof extract). The corrected version
 * incorporates Errata 1 of 08.04.2025. Tables 1-3, item 4.2, Table 6 and 6.3.2 were
 * compared with the supplied corrected copy (pages 1-48, SHA below): no value changed;
 * the only difference found is the 6.3.2.1 c) leeward cross-reference ("Tabela 6"). */
export const NBR6123_EDITION="2023-corrected-2025" as const;
export const NBR6123_ERRATA="08.04.2025-partial-through-48" as const;
export const NBR6123_DOCUMENT_SHA256="02528d067892eb645aceec8edf56e73e85c15614d6af2c112e243fdda67a7a90";
export const NBR6123_LABEL="ABNT NBR 6123:2023, versão corrigida com a Errata 1 de 08.04.2025";

/** Fails when any wind record of one analysis carries another edition. */
export function assertSingleNbr6123Edition(records:readonly {edition:string}[]){
  const editions=[...new Set(records.map(r=>r.edition))];
  if(editions.length!==1||editions[0]!==NBR6123_EDITION)
    throw Error(`WIND_EDITION_MIXED: a análise deve usar somente ${NBR6123_EDITION}; encontrado ${editions.join(", ")||"nenhuma"}`);
  return NBR6123_EDITION;
}
