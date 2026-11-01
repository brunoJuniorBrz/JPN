/**
 * JPN / triagem preliminar de segurança contra incêndio em SP.
 * Nunca é licença, projeto técnico, isenção de hidrantes ou parecer.
 * Uma referência lida no decreto não equivale à revisão por profissional.
 */
export const SP_FIRE_RULESET = {
  id: "sp-69118-2024-screening-v1",
  uf: "SP",
  decree: "Decreto estadual nº 69.118/2024",
  verifiedFromOfficialTextOn: "2026-11-01",
  reviewedByFireProfessional: false,
  professionalReview: "pendente" as const,
  sources: [
    { title: "Decreto 69.118/2024: art. 3º, art. 4º, arts. 16 a 18, Tabelas 1, 2, 5 e 6", url: "https://www.al.sp.gov.br/repositorio/legislacao/decreto/2024/decreto-69118-09.12.2024.html" },
    { title: "Registro oficial do Decreto na ALESP / Diário Oficial", url: "https://www.al.sp.gov.br/norma/?id=210303" },
  ],
  areaThresholdM2: 750,
  legalHeightThresholdM: 12,
  // Não transcrever exigências por coluna de HTML (risco de deslocamento).
  provisionsReviewed: { hydantsIT22: false, technicalSimplificationIT42: false, fireLoadIT14: false, annexTablesProfessionallyReviewed: false },
} as const;

export const SP_FIRE_OCCUPANCIES = {
  "J-1": "Depósito J-1 — materiais incombustíveis",
  "J-2": "Depósito J-2",
  "J-3": "Depósito J-3",
  "J-4": "Depósito J-4",
  "I-1": "Indústria I-1",
  "I-2": "Indústria I-2",
  "G-4": "Serviços automotivos G-4",
  "D-1": "Escritórios D-1",
  "C-1": "Comércio C-1",
  "C-2": "Comércio C-2",
} as const;

export type SpFireOccupancy = keyof typeof SP_FIRE_OCCUPANCIES;

export type SpFireReference = {
  rulesetId: string;
  decree: string;
  verifiedFromOfficialTextOn: string;
  reviewedByFireProfessional: false;
  sources: typeof SP_FIRE_RULESET.sources;
};
export function spFireReference(): SpFireReference {
  return {
    rulesetId: SP_FIRE_RULESET.id,
    decree: SP_FIRE_RULESET.decree,
    verifiedFromOfficialTextOn: SP_FIRE_RULESET.verifiedFromOfficialTextOn,
    reviewedByFireProfessional: SP_FIRE_RULESET.reviewedByFireProfessional,
    sources: SP_FIRE_RULESET.sources,
  };
}
