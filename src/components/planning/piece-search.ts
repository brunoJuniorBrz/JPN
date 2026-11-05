import { roleLabels, type StructurePiece } from "@/domain/structure";

/** UI-only search: no mutation, sorting or change to generated quantities. */
export function findPieces(pieces: readonly StructurePiece[], query: string, limit = 50) {
  const term = query.trim().toLocaleLowerCase("pt-BR");
  const matches: StructurePiece[] = [];
  let total = 0;
  for (const piece of pieces) {
    if (term && !piece.id.toLocaleLowerCase("pt-BR").includes(term) &&
        !roleLabels[piece.role].toLocaleLowerCase("pt-BR").includes(term)) continue;
    total++;
    if (matches.length < limit) matches.push(piece);
  }
  return { matches, total };
}
