import type { PhysicalGroup } from "./physical-declaration";
import { resistancePreparationSchema } from "./resistance-preparation";
import type { StructurePiece } from "./structure";

/**
 * Explicit, idealized mechanics references, NOT a resistance check or a
 * normative calculation. In particular Euler flexural buckling describes an
 * ideal straight, prismatic member with an engineer-declared effective length.
 * Local/distortional buckling, torsional modes, imperfections, member
 * interaction, connections, code factors and actual capacity are NOT checked.
 *
 * These numbers are never written into the FE input, project or quotation.
 */
export function elasticMemberReference(piece: StructurePiece, group: PhysicalGroup, declaration: unknown) {
  const issues: string[] = [];
  const parsed = resistancePreparationSchema.safeParse(declaration);
  if (!parsed.success) {
    return { status: "pending" as const, approved: false as const, reference: null, issues: ["Cadastre os dados resistentes da peça antes de calcular referências teóricas."] };
  }
  const d = parsed.data;
  if (d.pieceId !== piece.id) issues.push("Cadastro pertence a outra peça; referências bloqueadas.");
  if (d.family === null) issues.push("Família real do perfil não declarada.");
  if (!d.source.trim() || !d.revision.trim() || !d.restraintDescription.trim())
    issues.push("Informe origem, revisão e descrição das condições de contenção.");
  if (!group.steelGrade.trim() || !group.materialSource.trim() || !group.materialRevision.trim() ||
      !group.sectionSource.trim() || !group.sectionRevision.trim())
    issues.push("Dados físicos de material e seção precisam de fontes e revisões.");
  if (group.rotationDeg === null) issues.push("Orientação dos eixos da seção não declarada.");
  const inputs = {
    areaCm2: group.areaCm2, iyCm4: group.iyCm4, izCm4: group.izCm4,
    eGpa: group.eGpa, fyMpa: d.fyMpa, fuMpa: d.fuMpa,
    effectiveLengthYM: d.bucklingYM, effectiveLengthZM: d.bucklingZM,
  };
  for (const [key, value] of Object.entries(inputs))
    if (value === null || !Number.isFinite(value) || value <= 0) issues.push(`${key}: propriedade positiva e rastreável pendente.`);
  if (d.fyMpa !== null && d.fuMpa !== null && d.fuMpa < d.fyMpa)
    issues.push("Resistência última fu menor que escoamento fy.");
  if (!Number.isFinite(piece.lengthMm) || piece.lengthMm <= 0) issues.push("Comprimento da peça inválido.");
  if (issues.length) return { status: "pending" as const, approved: false as const, reference: null, issues };

  const areaM2 = group.areaCm2! * 1e-4;
  const iyM4 = group.iyCm4! * 1e-8, izM4 = group.izCm4! * 1e-8;
  const ePa = group.eGpa! * 1e9, fyPa = d.fyMpa! * 1e6;
  const ryM = Math.sqrt(iyM4 / areaM2), rzM = Math.sqrt(izM4 / areaM2);
  const effectiveLengthYM = d.bucklingYM!, effectiveLengthZM = d.bucklingZM!;
  const values = {
    physicalLengthM: piece.lengthMm / 1000,
    effectiveLengthYM, effectiveLengthZM,
    radiusYMm: ryM * 1000, radiusZMm: rzM * 1000,
    slendernessY: effectiveLengthYM / ryM, slendernessZ: effectiveLengthZM / rzM,
    grossYieldReferenceKn: areaM2 * fyPa / 1000,
    eulerYKn: Math.PI ** 2 * ePa * iyM4 / effectiveLengthYM ** 2 / 1000,
    eulerZKn: Math.PI ** 2 * ePa * izM4 / effectiveLengthZM ** 2 / 1000,
  };
  if (Object.values(values).some(value => !Number.isFinite(value) || value <= 0))
    return { status: "pending" as const, approved: false as const, reference: null, issues: ["Limite numérico excedido nas referências teóricas."] };

  return {
    status: "reference-only" as const, approved: false as const, reference: values,
    issues: [
      "VALORES TEÓRICOS, NÃO RESISTÊNCIAS DE CÁLCULO: sem coeficientes normativos ou interação entre solicitações.",
      "Euler considera somente flambagem elástica flexional idealizada nos comprimentos efetivos DECLARADOS; não calcula K, vínculos ou estabilidade global.",
      d.family === "cold-formed"
        ? "Perfil formado a frio: flambagem local, distorcional e propriedades efetivas NÃO verificadas."
        : "Flambagem local, lateral com torção, imperfeições, ligações e outros modos NÃO verificados.",
      "É obrigatória revisão por engenheiro e aplicação integral das normas vigentes antes de dimensionar ou fabricar.",
    ],
  };
}
