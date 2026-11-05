import type { Project } from "../models";
import { generateStructure } from "./structure";
import { structureSignature } from "./project-basis";
import { projectCutting } from "./cutting";

/**
 * A traceable pre-production dossier. Its output cannot represent a cutting
 * release: engineering design, connections and physical fabrication details
 * are not yet complete in JPN.
 *
 * Counts and quantities are derived from the same StructureModel as the 3D,
 * CAD and preliminary quotations. Never infer physical materials or cuts.
 */
export type PreproductionIssue = {
  code: "VISUAL_ONLY" | "PROFILE_MISSING" | "STEEL_MISSING" | "PROFILE_SOURCE_MISSING" |
    "STOCK_MISSING" | "MASS_MISSING" | "FINAL_LENGTH_MISSING" |
    "FINAL_LENGTH_STALE" | "FABRICATION_ORPHAN" | "FABRICATION_DUPLICATE" |
    "CUTTING_PENDING" | "DESIGN_UNVERIFIED" | "CONNECTIONS_PENDING" |
    "BRACING_PENDING" | "ROOF_ACCESSORIES_PENDING";
  pieceId?: string;
  message: string;
};

export function buildPreproductionDossier(project: Project) {
  const geometry = generateStructure(project);
  if (!geometry.model) throw new Error(geometry.pending[0] ?? "Geometria estrutural indisponível.");
  const model = geometry.model, signature = structureSignature(project);
  const issues: PreproductionIssue[] = [];
  const add = (code: PreproductionIssue["code"], message: string, pieceId?: string) =>
    issues.push({ code, message, ...(pieceId ? { pieceId } : {}) });

  if (project.technicalNotes.startsWith("PRÉ-PROJETO VISUAL:") ||
      model.pieces.some(piece => piece.profile.name.startsWith("VISUAL PROVISÓRIO"))) {
    add("VISUAL_ONLY", "A geometria contém dados de pré-visualização não dimensionados; não especifica materiais para compra.");
  }

  const fabrication = new Map<string, (typeof project.workspace.fabrication)[number]>();
  const duplicateIds = new Set<string>();
  const ids = new Set(model.pieces.map(p => p.id));
  for (const item of project.workspace.fabrication) {
    if (!ids.has(item.pieceId)) {
      add("FABRICATION_ORPHAN", "Comprimento cadastrado para peça ausente da geometria atual.", item.pieceId);
    }
    if (fabrication.has(item.pieceId)) {
      add("FABRICATION_DUPLICATE", "Há mais de um cadastro de comprimento final para esta peça; os registros foram invalidados.", item.pieceId);
      duplicateIds.add(item.pieceId);
    }
    fabrication.set(item.pieceId, item);
  }

  const pieces = model.pieces.map(piece => {
    const profile = piece.profile, declared = fabrication.get(piece.id);
    const current = declared?.signature === signature && !duplicateIds.has(piece.id);
    if (!profile.name.trim() || profile.name.startsWith("VISUAL PROVISÓRIO"))
      add("PROFILE_MISSING", "Perfil comercial definitivo não declarado.", piece.id);
    if (!profile.steelGrade.trim()) add("STEEL_MISSING", "Aço do perfil não declarado.", piece.id);
    if (!profile.source.trim() || /sintétic[ao]|pré-visualização/i.test(profile.source))
      add("PROFILE_SOURCE_MISSING", "Fonte comercial e técnica do perfil pendente.", piece.id);
    if (profile.stockLengthM === null)
      add("STOCK_MISSING", "Comprimento comercial não confirmado.", piece.id);
    if (profile.massKgM === null) add("MASS_MISSING", "Massa linear não confirmada.", piece.id);
    if (!declared) add("FINAL_LENGTH_MISSING", "Comprimento final de fabricação não declarado.", piece.id);
    else if (duplicateIds.has(piece.id)) add("FINAL_LENGTH_STALE", "Comprimento final bloqueado por registros duplicados.", piece.id);
    else if (!current) add("FINAL_LENGTH_STALE", "Comprimento declarado pertence a uma revisão geométrica anterior.", piece.id);
    return {
      id: piece.id, role: piece.role,
      profileName: profile.name, steelGrade: profile.steelGrade, profileSource: profile.source,
      stockLengthM: profile.stockLengthM, massKgM: profile.massKgM,
      startNode: piece.start, endNode: piece.end,
      geometricLengthMm: piece.lengthMm,
      finalDeclaredLengthMm: current ? declared!.lengthMm : null,
      finalLengthState: !declared ? "missing" as const : current ? "declared-unverified" as const : "stale" as const,
      finalLengthNote: current ? declared!.note : null,
    };
  });

  const groupMap = new Map<string, {
    role: (typeof pieces)[number]["role"]; profileName: string; steelGrade: string;
    profileSource: string; stockLengthM: number | null; ids: string[];
    geometricTotalMm: number; finalDeclaredTotalMm: number | null; massKg: number | null;
  }>();
  for (const piece of pieces) {
    const key = JSON.stringify([piece.role,piece.profileName,piece.steelGrade,piece.profileSource,piece.stockLengthM]);
    let group = groupMap.get(key);
    if (!group) {
      group = { role:piece.role, profileName:piece.profileName, steelGrade:piece.steelGrade,
        profileSource:piece.profileSource, stockLengthM:piece.stockLengthM, ids:[],
        geometricTotalMm:0, finalDeclaredTotalMm:0, massKg:0 };
      groupMap.set(key,group);
    }
    group.ids.push(piece.id);
    group.geometricTotalMm += piece.geometricLengthMm;
    group.finalDeclaredTotalMm = group.finalDeclaredTotalMm === null || piece.finalDeclaredLengthMm === null
      ? null : group.finalDeclaredTotalMm + piece.finalDeclaredLengthMm;
    group.massKg = group.massKg === null || piece.massKgM === null
      ? null : group.massKg + piece.massKgM * piece.geometricLengthMm / 1000;
  }
  const groups = [...groupMap.values()].map(group => ({
    ...group, quantity:group.ids.length,
  }));

  let cutting: ReturnType<typeof projectCutting> | null = null;
  if (project.workspace.cutting.useFabrication && duplicateIds.size) {
    add("CUTTING_PENDING", "Simulação com comprimentos finais bloqueada: registros duplicados precisam ser corrigidos.");
  } else {
    try { cutting=projectCutting(project); }
    catch (error) {
      add("CUTTING_PENDING", `Simulação de corte indisponível: ${error instanceof Error ? error.message : "parâmetros inválidos"}`);
    }
  }
  // Structural design and fabrication checks are deliberately NOT inferred
  // from locally saved analysis, synthetic examples or manual length entries.
  add("DESIGN_UNVERIFIED", "Dimensionamento completo, carregamentos normativos e aprovação técnica não comprovados.");
  add("CONNECTIONS_PENDING", "Detalhes e quantitativos de soldas, chapas, parafusos e ancoragens não validados.");
  add("BRACING_PENDING", "Contraventamentos e contenções da estrutura não detalhados nem quantificados.");
  add("ROOF_ACCESSORIES_PENDING", "Telhas comerciais, sobreposições, fixadores e acessórios não quantificados.");

  return {
    schema_version: "jpn.preproduction/1" as const,
    status: "preliminary-not-released" as const,
    approvedForFabrication: false as const,
    allowedUse: "Conferência, planejamento e cotação preliminar; não emitir ordem de compra ou corte." as const,
    projectId: project.id, projectName:project.name,
    geometrySignature:signature, roofRevision:project.roof.revision,
    pieces, groups, issues, cutting,
    totals: {
      pieces:pieces.length, groups:groups.length,
      geometricLengthMm: pieces.reduce((sum,p)=>sum+p.geometricLengthMm,0),
      fullyDeclaredFinalLengths: pieces.every(p=>p.finalDeclaredLengthMm!==null),
      completeMass: groups.every(g=>g.massKg!==null),
      knownMassKg:groups.reduce((sum,g)=>sum+(g.massKg??0),0),
      simulatedStockBars:cutting ? cutting.groups.reduce((sum,g)=>sum+g.bars.length,0) : null,
    },
  };
}

export type PreproductionDossier = ReturnType<typeof buildPreproductionDossier>;
